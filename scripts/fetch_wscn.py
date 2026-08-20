#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

API_BASE = "https://api-one.wallstcn.com/apiv1/content/lives"
CHANNEL = "global-channel"
CST = timezone(timedelta(hours=8))

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "site" / "data" / "latest.json"
CACHE_FILE = ROOT / "cache" / "news_history.json"

PER_PAGE = 50
MAX_PAGES = 40
FETCH_WINDOW_HOURS = 24
RETENTION_DAYS = 7

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/151.0 Safari/537.36"
    ),
    "Accept": "application/json,text/plain,*/*",
    "Referer": "https://wallstreetcn.com/live/global",
}


def html_to_text(value: str) -> str:
    if not value:
        return ""
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</p>\s*<p[^>]*>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    value = html.unescape(value)
    value = value.replace("\u200b", "").replace("\xa0", " ")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def request_json(url: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}: {url}")
        return json.loads(resp.read().decode("utf-8"))


def fetch_page(cursor: str | int | None = None) -> tuple[list[dict[str, Any]], Any]:
    params: dict[str, Any] = {
        "channel": CHANNEL,
        "client": "pc",
        "limit": PER_PAGE,
    }
    if cursor is None:
        params["first_page"] = "true"
    else:
        params["cursor"] = cursor

    url = API_BASE + "?" + urllib.parse.urlencode(params)
    payload = request_json(url)
    data = payload.get("data") or {}
    return data.get("items") or [], data.get("next_cursor")


def parse_item(item: dict[str, Any]) -> dict[str, Any]:
    ts = int(item.get("display_time") or 0)
    dt = datetime.fromtimestamp(ts, tz=CST)

    content_html = item.get("content") or ""
    content_more = item.get("content_more") or ""
    if content_more:
        content = html_to_text(content_html + "\n" + content_more)
    else:
        content = (item.get("content_text") or "").strip() or html_to_text(content_html)

    article_raw = item.get("article") or None
    article = None
    if article_raw:
        article = {
            "id": article_raw.get("id"),
            "title": article_raw.get("title") or "",
            "uri": article_raw.get("uri") or "",
        }

    images = [
        image.get("uri")
        for image in (item.get("images") or [])
        if image.get("uri")
    ]

    live_id = item.get("id")
    uri = item.get("uri") or (
        f"https://wallstreetcn.com/livenews/{live_id}" if live_id else ""
    )

    return {
        "id": live_id,
        "time": dt.strftime("%H:%M:%S"),
        "datetime": dt.isoformat(),
        "display_time": ts,
        "title": item.get("title") or "",
        "content": content,
        "score": int(item.get("score") or 1),
        "uri": uri,
        "images": images,
        "article": article,
    }


def item_key(item: dict[str, Any]) -> str:
    if item.get("id") is not None:
        return f"id:{item['id']}"

    basis = "|".join(
        [
            str(item.get("display_time") or ""),
            str(item.get("title") or ""),
            str(item.get("content") or ""),
        ]
    )
    return "hash:" + hashlib.sha256(basis.encode("utf-8")).hexdigest()


def collect_last_24h() -> list[dict[str, Any]]:
    now = datetime.now(CST)
    cutoff = now - timedelta(hours=FETCH_WINDOW_HOURS)

    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    cursor = None

    for _ in range(MAX_PAGES):
        raw_items, next_cursor = fetch_page(cursor)
        if not raw_items:
            break

        reached_cutoff = False

        for raw in raw_items:
            ts = int(raw.get("display_time") or 0)
            if not ts:
                continue

            dt = datetime.fromtimestamp(ts, tz=CST)

            if dt < cutoff:
                reached_cutoff = True
                break

            if dt > now + timedelta(minutes=5):
                continue

            parsed = parse_item(raw)
            key = item_key(parsed)

            if key in seen:
                continue

            seen.add(key)
            results.append(parsed)

        if reached_cutoff or not next_cursor:
            break

        cursor = next_cursor

    results.sort(key=lambda x: x.get("display_time", 0), reverse=True)
    return results


def load_history() -> list[dict[str, Any]]:
    if not CACHE_FILE.exists():
        return []

    try:
        payload = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload.get("items") or []
        if isinstance(payload, list):
            return payload
    except Exception:
        pass

    return []


def merge_history(
    old_items: list[dict[str, Any]],
    fresh_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    now = datetime.now(CST)
    retention_cutoff = int((now - timedelta(days=RETENTION_DAYS)).timestamp())

    merged: dict[str, dict[str, Any]] = {}

    for item in old_items:
        if int(item.get("display_time") or 0) >= retention_cutoff:
            merged[item_key(item)] = item

    for item in fresh_items:
        if int(item.get("display_time") or 0) >= retention_cutoff:
            merged[item_key(item)] = item

    items = list(merged.values())
    items.sort(key=lambda x: x.get("display_time", 0), reverse=True)
    return items


def main() -> int:
    now = datetime.now(CST)

    try:
        fresh_items = collect_last_24h()
    except (
        urllib.error.URLError,
        urllib.error.HTTPError,
        TimeoutError,
        RuntimeError,
        json.JSONDecodeError,
    ) as exc:
        print(f"抓取失败：{exc}", file=sys.stderr)
        return 1

    if not fresh_items:
        print("警告：近24小时返回 0 条数据，终止部署以保留上一次成功版本。", file=sys.stderr)
        return 2

    history_items = merge_history(load_history(), fresh_items)

    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(
        json.dumps(
            {
                "generated_at": now.isoformat(),
                "retention_days": RETENTION_DAYS,
                "items": history_items,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    payload = {
        "source": "华尔街见闻",
        "source_url": "https://wallstreetcn.com/live/global",
        "channel": CHANNEL,
        "date": now.strftime("%Y-%m-%d"),
        "timezone": "Asia/Shanghai",
        "generated_at": now.isoformat(),
        "window_hours": FETCH_WINDOW_HOURS,
        "retention_days": RETENTION_DAYS,
        "count": len(fresh_items),
        "history_count": len(history_items),
        "items": fresh_items,
        "history_items": history_items,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        f"已写入 {OUTPUT}：近24小时 {len(fresh_items)} 条；"
        f"近{RETENTION_DAYS}天缓存 {len(history_items)} 条"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

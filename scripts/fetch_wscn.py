#!/usr/bin/env python3
"""
抓取华尔街见闻「要闻 / 全球」频道的今日快讯，并输出给 GitHub Pages 使用的 JSON。

数据接口是华尔街见闻网页前端使用的内部接口（非官方公开文档）：
https://api-one.wallstcn.com/apiv1/content/lives

当前频道：
global-channel = https://wallstreetcn.com/live/global
"""

from __future__ import annotations

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
OUTPUT = Path(__file__).resolve().parents[1] / "site" / "data" / "latest.json"
PER_PAGE = 50
MAX_PAGES = 30

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

    images = []
    for image in item.get("images") or []:
        uri = image.get("uri")
        if uri:
            images.append(uri)

    live_id = item.get("id")
    uri = item.get("uri") or (f"https://wallstreetcn.com/livenews/{live_id}" if live_id else "")

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


def collect_today() -> list[dict[str, Any]]:
    now = datetime.now(CST)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    results: list[dict[str, Any]] = []
    seen: set[Any] = set()
    cursor = None

    for _ in range(MAX_PAGES):
        items, next_cursor = fetch_page(cursor)
        if not items:
            break

        reached_previous_day = False

        for raw in items:
            ts = int(raw.get("display_time") or 0)
            if not ts:
                continue

            dt = datetime.fromtimestamp(ts, tz=CST)
            if dt < start:
                reached_previous_day = True
                break
            if dt > now + timedelta(minutes=5):
                continue

            item_id = raw.get("id")
            if item_id in seen:
                continue
            seen.add(item_id)
            results.append(parse_item(raw))

        if reached_previous_day or not next_cursor:
            break

        cursor = next_cursor

    results.sort(key=lambda x: x.get("display_time", 0), reverse=True)
    return results


def main() -> int:
    now = datetime.now(CST)
    try:
        items = collect_today()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"抓取失败：{exc}", file=sys.stderr)
        return 1

    payload = {
        "source": "华尔街见闻",
        "source_url": "https://wallstreetcn.com/live/global",
        "channel": CHANNEL,
        "date": now.strftime("%Y-%m-%d"),
        "timezone": "Asia/Shanghai",
        "generated_at": now.isoformat(),
        "count": len(items),
        "items": items,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已写入 {OUTPUT}：{len(items)} 条，日期 {payload['date']}")

    # 如果突然一条也拿不到，让 Action 失败，避免把正常页面覆盖成空白。
    if not items:
        print("警告：今日返回 0 条数据，终止部署以保留上一次成功版本。", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

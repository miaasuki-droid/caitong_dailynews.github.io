#!/usr/bin/env python3
from __future__ import annotations

import os
import time
import urllib.parse

import fetch_wscn as base


# Always bypass intermediary/API caches for refresh runs.
base.HEADERS["Cache-Control"] = "no-cache"
base.HEADERS["Pragma"] = "no-cache"

# The workflow sets this to:
#   168 hours for workflow_dispatch (website button / GitHub manual run)
#    24 hours for the daily 00:00 Beijing scheduled run.
fetch_hours = int(os.environ.get("WSCN_FETCH_HOURS", "24"))
fetch_hours = max(1, min(fetch_hours, 24 * 10))

base.FETCH_WINDOW_HOURS = fetch_hours

# A 7-day backfill can require substantially more pages than a 24h refresh.
# Keep the daily run light, but allow enough pagination for manual backfills.
if fetch_hours > 24:
    base.MAX_PAGES = max(base.MAX_PAGES, 160)


def fresh_fetch_page(cursor=None):
    params = {
        "channel": base.CHANNEL,
        "client": "pc",
        "limit": base.PER_PAGE,
        "_t": int(time.time() * 1000),
    }

    if cursor is None:
        params["first_page"] = "true"
    else:
        params["cursor"] = cursor

    url = base.API_BASE + "?" + urllib.parse.urlencode(params)
    payload = base.request_json(url)
    data = payload.get("data") or {}
    return data.get("items") or [], data.get("next_cursor")


base.fetch_page = fresh_fetch_page

if __name__ == "__main__":
    print(
        f"Refresh mode: fetching latest {base.FETCH_WINDOW_HOURS} hours "
        f"(retention {base.RETENTION_DAYS} days)"
    )
    raise SystemExit(base.main())

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Loading the extension

There is no build step. Load the extension directory directly in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this directory

After editing any file, click the reload icon on the extension card. For popup/options changes, just close and reopen the popup.

## Architecture

This is a **Manifest V3** Chrome extension with three entry points:

- **`background.js`** — Service worker. Polls Pi-hole every minute via `chrome.alarms` and updates the toolbar badge (shows block % in green, or red when disabled/unreachable).
- **`popup.js`** — Runs when the popup opens. Polls every 5 seconds (`REFRESH_MS`), renders stats and a scrollable list of up to 60 recent blocked queries. Also handles suspend/resume via the Pi-hole API.
- **`options.js`** — Settings page. Saves `piholeIp` and `piholeToken` to `chrome.storage.local` after verifying connectivity.

## Pi-hole API

The extension targets **Pi-hole v5** (FTL) using the legacy `/admin/api.php` endpoint. Key calls:

| Action | Query param |
|---|---|
| Summary stats | `?summary&auth=TOKEN` |
| Recent queries (last 200) | `?getAllQueries=200&auth=TOKEN` |
| Suspend N seconds | `?disable=N&auth=TOKEN` |
| Resume | `?enable&auth=TOKEN` |

`BLOCKED_STATUSES` in `popup.js` is the set of Pi-hole status codes (column index 4 in query rows) that count as blocked. Pi-hole v6 uses a different API (`/api/`) and is not currently supported.

## Config

Stored in `chrome.storage.local` under keys `piholeIp` (hostname or IP, no protocol) and `piholeToken` (API token from Pi-hole settings). Both popup and background read directly from storage on each load/poll.

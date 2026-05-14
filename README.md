# Pi-hole Monitor

A Chrome extension for monitoring and managing your Pi-hole from the toolbar.

## Features

- **Toolbar badge** — shows today's block percentage in green, red when Pi-hole is unreachable or disabled, orange when manually paused
- **Stats** — live query count, blocked count, and block percentage
- **Blocked tab** — up to 60 recent blocked queries, deduplicated by domain with a repeat count; type in the search bar to filter; click `+` to whitelist a domain
- **Allowed tab** — up to 60 recent allowed queries; type in the search bar to filter; click a domain to open it in a new tab, click `−` to blacklist it
- **Top tab** — top blocked domains today with relative count bars; click `+` to whitelist
- **Pause/resume** — suspend blocking for 30s, 5m, 30m, or indefinitely with a countdown in the badge

## Setup

1. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this directory
2. Click the extension icon and open **Settings**
3. Enter your Pi-hole hostname or IP (no protocol, e.g. `192.168.1.100`) and your API token (found in Pi-hole admin → Settings → API)

## Requirements

- Pi-hole v5 (uses the legacy `/admin/api.php` endpoint — Pi-hole v6 is not currently supported)
- Chrome with Manifest V3 support

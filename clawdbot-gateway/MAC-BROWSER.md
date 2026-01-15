# Mac Remote Browser Setup

This guide covers running a standalone browser server on macOS that can be controlled from the Home Assistant Clawdbot gateway.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  HA Server (192.168.1.200)                                              │
│                                                                         │
│  clawdbot gateway                                                       │
│       │                                                                 │
│       │ browser.controlUrl: http://192.168.1.177:18791                  │
│       │ browser.controlToken: miki                                      │
│       │                                                                 │
└───────┼─────────────────────────────────────────────────────────────────┘
        │
        │ HTTP requests (with Bearer token)
        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Mac (192.168.1.177)                                                    │
│                                                                         │
│  clawdbot browser serve --bind 0.0.0.0 --port 18791 --token miki        │
│       │                                                                 │
│       ▼                                                                 │
│  Playwright Chromium (visible or headless)                              │
└─────────────────────────────────────────────────────────────────────────┘
```

This is a lightweight setup - only the browser server runs on Mac, no gateway or Mac app needed.

## Prerequisites

On the Mac:
- **Node.js 22+**
- **pnpm**
- **Clawdbot CLI** installed (see [MAC.md](./MAC.md) for installation)

## Quick Start

### 1. Start the Browser Server on Mac

```bash
# Start browser server bound to network interface
clawdbot browser serve --bind 0.0.0.0 --port 18791 --token <your-token>
```

Options:
- `--bind 0.0.0.0` - Listen on all interfaces (required for remote access)
- `--port 18791` - Port to listen on (default: 18791)
- `--token <token>` - Bearer token for authentication (required when binding to non-loopback)

Example:
```bash
clawdbot browser serve --bind 0.0.0.0 --port 18791 --token miki
```

Output:
```
🦞 Browser control listening on http://0.0.0.0:18791/
Auth: Bearer token required.
```

### 2. Configure HA Gateway

Edit `/config/clawdbot/clawdbot.json` on the HA server:

```json
{
  "browser": {
    "enabled": true,
    "controlUrl": "http://<mac-ip>:18791",
    "controlToken": "<your-token>"
  }
}
```

Example:
```json
{
  "browser": {
    "enabled": true,
    "controlUrl": "http://192.168.1.177:18791",
    "controlToken": "miki"
  }
}
```

Alternatively, set the token via environment variable:
```bash
export CLAWDBOT_BROWSER_CONTROL_TOKEN="miki"
```

### 3. Restart HA Addon

Restart the Clawdbot Gateway addon to pick up the new config.

## Starting the Browser

The browser server controls browser instances but doesn't start one automatically. Start a browser instance:

### From HA (via CLI)

```bash
# Start browser with default profile
clawdbot browser start

# Start with specific profile
clawdbot browser start --browser-profile clawd
```

### Via API (direct)

```bash
# Start browser (POST request with auth)
curl -X POST -H "Authorization: Bearer miki" \
  "http://192.168.1.177:18791/start?profile=clawd"
```

## Browser Profiles

Profiles allow separate browser instances with isolated data:

| Profile | Description |
|---------|-------------|
| `clawd` | Default Playwright profile (recommended) |
| `chrome` | Uses Chrome extension relay (requires extension) |

Use `clawd` profile for automation - it's a dedicated Playwright Chromium instance.

## Common Commands (from HA)

Once configured, run browser commands from HA:

```bash
# Check browser status
clawdbot browser status

# Start browser
clawdbot browser start --browser-profile clawd

# Open a URL
clawdbot browser open https://example.com

# Navigate current tab
clawdbot browser navigate https://google.com

# Take screenshot
clawdbot browser screenshot

# Get page snapshot (for AI)
clawdbot browser snapshot --format aria

# List open tabs
clawdbot browser tabs

# Click element by ref
clawdbot browser click 12

# Type text
clawdbot browser type 5 "hello world"

# Stop browser
clawdbot browser stop
```

## Running as a Service (launchd)

To run the browser server persistently on Mac:

### Create Launch Agent

Create `~/Library/LaunchAgents/com.clawdbot.browser-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.clawdbot.browser-serve</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/YOUR_USERNAME/Library/pnpm/clawdbot</string>
        <string>browser</string>
        <string>serve</string>
        <string>--bind</string>
        <string>0.0.0.0</string>
        <string>--port</string>
        <string>18791</string>
        <string>--token</string>
        <string>YOUR_TOKEN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/clawdbot-browser-serve.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/clawdbot-browser-serve.log</string>
</dict>
</plist>
```

Replace `YOUR_USERNAME` and `YOUR_TOKEN` with your values.

### Load the Service

```bash
# Load and start
launchctl load ~/Library/LaunchAgents/com.clawdbot.browser-serve.plist

# Check status
launchctl list | grep clawdbot

# View logs
tail -f /tmp/clawdbot-browser-serve.log

# Stop and unload
launchctl unload ~/Library/LaunchAgents/com.clawdbot.browser-serve.plist
```

## Headless vs Visible Mode

By default, the browser runs in **visible mode** (non-headless) so you can see what it's doing.

To run headless, set in Mac's `~/.clawdbot/clawdbot.json`:

```json
{
  "browser": {
    "headless": true
  }
}
```

## Troubleshooting

### Connection Refused from HA

1. Verify browser server is running on Mac:
   ```bash
   curl -H "Authorization: Bearer miki" http://127.0.0.1:18791/
   ```

2. Check Mac firewall allows incoming connections on port 18791

3. Verify network connectivity:
   ```bash
   # From HA
   curl -H "Authorization: Bearer miki" http://<mac-ip>:18791/
   ```

### 401 Unauthorized

The token doesn't match. Ensure `controlToken` in HA config matches `--token` on Mac.

### Browser Won't Start

Check if Chromium/Chrome is installed:
```bash
clawdbot browser status --json
```

Playwright will download Chromium automatically on first use.

### Port Already in Use

```bash
# Find what's using the port
lsof -nP -iTCP:18791 -sTCP:LISTEN

# Kill it
kill -9 <PID>
```

## Security Notes

- Always use a strong token when binding to `0.0.0.0`
- The token is sent as `Authorization: Bearer <token>` header
- Consider firewall rules to restrict access to trusted IPs
- For production, use a reverse proxy with TLS

## API Reference

The browser server exposes a REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Status |
| `/start` | POST | Start browser |
| `/stop` | POST | Stop browser |
| `/navigate` | POST | Navigate to URL |
| `/screenshot` | GET | Capture screenshot |
| `/snapshot` | GET | Get page snapshot |
| `/tabs` | GET | List tabs |
| `/click` | POST | Click element |
| `/type` | POST | Type text |

All endpoints require `Authorization: Bearer <token>` header.

## File Locations

| Item | Path |
|------|------|
| Mac config | `~/.clawdbot/clawdbot.json` |
| Browser profiles | `~/.clawdbot/browser/` |
| Launch agent | `~/Library/LaunchAgents/com.clawdbot.browser-serve.plist` |
| Logs | `/tmp/clawdbot-browser-serve.log` |

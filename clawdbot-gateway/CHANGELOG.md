# Changelog

## 3.0.2

- Fix gateway startup failure after upstream sync to v2026.2.24: enable `dangerouslyAllowHostHeaderOriginFallback` for non-loopback Control UI (HA provides its own auth via ingress)

## 3.0.1

- Fix pnpm aborting in container: set `CI=true` for non-interactive mode

## 3.0.0

**Upstream sync to v2026.2.3 + OpenClaw rebrand**

### Breaking Changes
- **Rebrand:** upstream renamed from `clawdbot` to `openclaw` (github.com/openclaw/openclaw)
- **Gateway auth required:** auth mode "none" removed in upstream v2026.1.29 — `gateway_token` must be set
- **Config options renamed:** `clawdbot_repo` → `openclaw_repo`, `clawdbot_version` → `openclaw_version`
- **Environment variables renamed:** `CLAWDBOT_*` → `OPENCLAW_*` (`OPENCLAW_STATE_DIR`, `OPENCLAW_WORKSPACE_DIR`, `OPENCLAW_APP_DIR`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_NO_RESPAWN`)
- **Default workspace path:** `/share/clawdbot` → `/share/openclaw`
- **Default state/app dirs:** `/config/clawdbot` → `/config/openclaw`, `/config/clawdbot-app` → `/config/openclaw-app`
- **Config file:** `clawdbot.json` → `openclaw.json`

### Migration
- Legacy directories (`/config/clawdbot`, `/config/clawdbot-app`) are auto-migrated on first start
- Legacy config file (`clawdbot.json`) is auto-migrated to `openclaw.json`
- Legacy `clawdbot` CLI wrapper kept as symlink to `openclaw`

### Upstream highlights (v2026.1.23 → v2026.2.3)
- 30+ security fixes (gateway auth bypass, SSRF, path traversal, credential exfiltration, sandbox hardening)
- New channels: LINE, Feishu/Lark
- New providers: xAI Grok, Cloudflare AI Gateway, Moonshot
- Web UI: token usage dashboard, agents dashboard
- Cron overhaul: announce delivery, one-shot jobs, ISO 8601 schedules
- Build system: tsc → tsdown/tsgo (faster builds)
- Gateway: config.patch tool, TLS 1.3 minimum, diagnostic flags

## 2.0.35

- Fix version check showing "origin/..." instead of SHA: capture git output properly and redirect fetch stdout

## 2.0.34

- Fix startup crash when using tag versions: version helper functions now handle `set -e` safely

## 2.0.33

- Add tag version support for `clawdbot_version` config option (e.g., `v2.0.0` instead of `main`)

## 2.0.32

- Update gogcli to v0.7.1

## 2.0.31

- Update gogcli to v0.7.0

## 2.0.30

- Add Wake-on-LAN tools (`wakeonlan`, `etherwake`) for waking remote machines like Mac for browser automation

## 2.0.29

- Add MAC.md documenting remote Mac node setup via SSH tunnels

## 2.0.28

- Comment out Playwright/Chromium install (saves ~400MB) - use remote Mac browser instead
- Add MAC-BROWSER.md documenting remote browser setup via `clawdbot browser serve`

## 2.0.27

- Add Playwright with bundled Chromium for browser automation (headless browser control)

## 2.0.26

- Add `gog_keyring` config option to set `GOG_KEYRING_PASSWORD` env var for gogcli

## 2.0.22

- Gemini cli

## 2.0.19

- Fix gateway auth validation error: don't set `mode: 'none'` (not a valid schema value), instead omit mode field when auth is disabled

## 2.0.18

- Add network diagnostic tools: `ping` and `nmap` for troubleshooting connectivity issues

## 2.0.17

- Fix gateway token auto-generation: empty config now means "no auth" instead of auto-generating a token
- HA ingress handles authentication, so token auth is unnecessary for typical addon usage
- Legacy token files still work with a warning to delete if auth should be disabled

## 2.0.16

- Add `clawdbot` CLI to PATH - run `clawdbot configure`, `clawdbot models auth add`, etc. directly

## 2.0.15

- Sync with upstream (2026.1.9 → 2026.1.10): OAuth refresh for Claude CLI, reasoning fixes for iMessage, dedupe message tool replies

## 2.0.14

- Update gogcli to v0.5.4 (fixes path expansion and calendar timezone handling)

## 2.0.13

- Fix hac vacuum water level options: use correct values (off|mild|moderate|intense)

## 2.0.12

- Fix hac vacuum clean for Q Revo models (Qrevo Curv, Qrevo MaxV, etc.) that don't support `roborock.vacuum_clean_segment` service
- Falls back to `vacuum.send_command` with `app_segment_clean` when native service returns 400

## 2.0.0

**Major architectural change: Self-updating addon**

The addon now manages clawdbot installation and updates at runtime instead of baking the app into the Docker image. This enables updates without container rebuilds.

### New Features
- **Self-updating**: Clawdbot is cloned and built on first start, stored in persistent storage
- **Automatic updates**: Check for and apply updates on addon restart
- **Configurable repository**: Track upstream, a fork, or private repo
- **Version pinning**: Pin to specific branch/tag for stability
- **Rollback support**: Automatic rollback on failed updates

### New Configuration Options
- `clawdbot_repo`: Git repository URL (default: upstream)
- `clawdbot_version`: Branch or tag to track (default: main)
- `update_mode`: `disabled`, `check`, or `auto` (default: auto)
- `pin_version`: Prevent auto-updates when true

### Breaking Changes
- First start now takes 15-25 minutes on ARM (building from source)
- Local Dockerfile removed (CI-built images only)
- hac CLI moved to `clawdbot-gateway/tools/hac`

### Technical Details
- Bootstrap image includes: Node.js 22, pnpm, bun, git, build tools
- App stored in `/config/clawdbot-app` (persisted across restarts)
- Backup created before updates for rollback capability

## 1.0.7

- Fix bind mode: use "lan" instead of raw IP (upstream API change)
- Remove gateway_bind config option (now hardcoded to bind all interfaces)

## 1.0.6

- Copy Node.js 22 from builder stage instead of using Debian's Node 18
- Fixes regex `/v` flag syntax error (requires Node 20+)

## 1.0.5

- Explicitly set `init: false` to ensure s6-overlay runs as PID 1

## 1.0.4

- Add hac CLI for Home Assistant vacuum control
- Add vacuum_entity configuration option
- Restore bashio for proper s6-overlay integration

## 1.0.3

- Fix startup crash: remove `init: true` to let s6-overlay run as PID 1

## 1.0.2

- Sync with upstream (Telegram typing fix, markdown chunking, Playwright Bun patch)
- Various stability improvements

## 1.0.1

- Switch from Alpine to Debian base image for better binary compatibility (glibc)
- Pre-compiled Go binaries and other tools now work out of the box
- Improved compatibility with third-party integrations

## 1.0.0

- Initial release
- WhatsApp gateway support via Baileys
- Gateway daemon with token authentication
- Auto-generated tokens if not configured
- Home Assistant configuration UI integration

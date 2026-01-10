# Changelog

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

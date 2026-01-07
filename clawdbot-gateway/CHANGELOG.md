# Changelog

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

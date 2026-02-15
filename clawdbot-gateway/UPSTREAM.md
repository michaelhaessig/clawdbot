# Upstream Sync Guide

## Upstream Repository

- **Repo:** `https://github.com/openclaw/openclaw`
- **Git remote:** `upstream` (set via `git remote set-url upstream https://github.com/openclaw/openclaw.git`)
- **Last synced:** `v2026.2.14`

Previously at `https://github.com/clawdbot/clawdbot` (moved in v2026.1.29 rebrand).

## Quick Merge

```bash
git fetch upstream
git merge upstream/main
# Or merge a specific tag:
git merge v2026.X.Y
```

## Compatibility Checklist

After merging, verify these are still supported:

1. **CLI commands used by run.sh:**
   - `node dist/index.js gateway --port <port> --allow-unconfigured`
   - `node dist/index.js onboard --non-interactive ...`
   - Package is `openclaw`; binary is `openclaw` but `node dist/index.js` still works

2. **Environment variables:**
   - `OPENCLAW_STATE_DIR`, `OPENCLAW_WORKSPACE_DIR`, `OPENCLAW_APP_DIR`
   - `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_NO_RESPAWN`
   - Legacy `CLAWDBOT_*` fallbacks exist in upstream for state/config paths only

3. **Auth:** gateway auth mode "none" was removed in v2026.1.29 — token is always required

4. **Device pairing:** v2026.2.9 introduced mandatory device pairing (public-key + approval).
   - Local connections (127.0.0.1/::1) are auto-approved; LAN connections require explicit pairing.
   - HA addon sets `gateway.controlUi.allowInsecureAuth = true` to bypass this (HA provides its own auth).

5. **Check for breaking changes:**
   ```bash
   git log --oneline home-assistant..upstream/main
   head -100 CHANGELOG.md  # Look for "Breaking" section
   ```

6. **Verify no conflicts in:**
   - `clawdbot-gateway/run.sh`
   - `clawdbot-gateway/config.yaml`

## Key Files

| File | Purpose |
|------|---------|
| `run.sh` | Startup script - uses `gateway` and `onboard` commands |
| `config.yaml` | HA addon config schema |
| `build.yaml` | Docker build config |

## If Breaking Changes Occur

1. Update `run.sh` for new CLI flags/commands
2. Update `config.yaml` schema if new options needed
3. Bump version in `config.yaml`
4. Add entry to `CHANGELOG.md`

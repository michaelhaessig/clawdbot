# Upstream Sync Guide

## Quick Merge

```bash
git fetch upstream
git merge upstream/main
```

## Compatibility Checklist

After merging, verify these are still supported:

1. **CLI commands used by run.sh:**
   - `node dist/index.js gateway --port <port> --allow-unconfigured`
   - `node dist/index.js onboard --non-interactive ...`

2. **Check for breaking changes:**
   ```bash
   git log --oneline home-assistant..upstream/main
   head -100 CHANGELOG.md  # Look for "Breaking" section
   ```

3. **Verify no conflicts in:**
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

# Upstream Sync Guide

## Upstream Repository

- **Repo:** `https://github.com/openclaw/openclaw`
- **Git remote:** `upstream` (set via `git remote set-url upstream https://github.com/openclaw/openclaw.git`)
- **Last synced:** `v2026.4.29` (`c263d0edde`) — release notes call out slow-host startup fixes: bounded local discovery advertisement (#73865), background model-catalog reload (#74135), opt-in startup diagnostics timeline, opt-in QMD startup refresh (`memory.qmd.update.startup`), event-loop readiness diagnostics in `/readyz`. v2026.4.26 sync had been reverted (v3.1.8 withdrawn) due to startup hang in `config.auth` phase on aarch64 HA host; v2026.4.29 expected to fix this.

Previously at `https://github.com/clawdbot/clawdbot` (moved in v2026.1.29 rebrand).

## Quick Merge

```bash
git fetch upstream --tags
git merge v2026.X.Y -X theirs    # tag merge; -X theirs resolves text conflicts
```

If `-X theirs` leaves delete-vs-modify conflicts:

```bash
git status --short | awk '/^DU/{print $2}' | xargs git add  # they kept it, we add it
git status --short | awk '/^UD/{print $2}' | xargs git rm   # they deleted it, we delete it
```

After the merge, **always restore these fork-only files** that upstream doesn't have (the merge will wipe them or leave a degenerate auto-merged state):

| File | Why it must be restored |
|------|-------------------------|
| `repository.json` (repo root) | HA supervisor needs this to recognize the repo as an addon source. Without it, supervisor flags the store as `corrupt_repository` and silently skips reloads — `ha apps update` never sees the new version. |
| `clawdbot-gateway/**` | Our HA addon files (config.yaml, run.sh, CHANGELOG.md, etc.). Upstream doesn't have them but the merge can leave them in a stale state. |
| `Dockerfile.ha-addon` | Our HA addon build recipe. |
| `.github/workflows/ha-addon.yml` | Our addon CI workflow. |
| `package.json`, `pnpm-lock.yaml` | Take upstream's exact versions: `git checkout v2026.X.Y -- package.json pnpm-lock.yaml`. The auto-merge can leave these out of sync, causing `ERR_PNPM_OUTDATED_LOCKFILE` in the build. |

If the merge produces a tree that looks wrong (thousands of unexpected diffs vs upstream), the cleanest recovery is:

```bash
git reset --hard <pre-merge-HEAD>
git read-tree -m -u v2026.X.Y                                              # take upstream tree exactly
git checkout <pre-merge-HEAD> -- repository.json clawdbot-gateway/ \
    Dockerfile.ha-addon .github/workflows/ha-addon.yml                     # restore fork-only files
# Then commit-tree with both parents to keep the merge semantics:
TREE=$(git write-tree)
git commit-tree $TREE -p <pre-merge-HEAD> -p $(git rev-parse 'v2026.X.Y^{commit}') -m "Merge tag 'v2026.X.Y' into home-assistant"
git update-ref HEAD <new-commit>
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

## Updating the Addon on the HA Server (CLI)

UI version display lags supervisor state — use the CLI:

```bash
ssh ha 'ha supervisor update'                                          # only if blocked by "supervisor needs to be updated first"
ssh ha 'ha store reload'                                               # pull git + reload config.yaml
ssh ha 'ha apps info 1ff42d7b_clawdbot-gateway --raw-json | python3 \
    -c "import json,sys; d=json.load(sys.stdin)[\"data\"]; print(d[\"version\"],\"->\",d[\"version_latest\"])"'
ssh ha 'ha apps update 1ff42d7b_clawdbot-gateway'
ssh ha 'ha apps start 1ff42d7b_clawdbot-gateway'                       # if it doesn't auto-start
```

If `ha store reload` doesn't pick up the new version, the supervisor likely flagged the repo as `corrupt_repository` (e.g. after a force-push, or because `repository.json` is missing). Diagnose with:

```bash
ssh ha 'ha resolution info | grep -A1 1ff42d7b'
```

If `corrupt_repository` is listed, ensure `repository.json` exists at the repo root, then run:

```bash
ssh ha 'ha store repair 1ff42d7b'
ssh ha 'ha supervisor restart'
```

The restart is the load-bearing step — `ha store repair` re-clones but the supervisor only re-reads `repository.json` on startup, so without the restart the corruption flag stays set even though the file is now present.

# Home Assistant Add-on Documentation

This document explains how the Clawdbot Home Assistant add-on works and how to maintain it.

## Overview

The add-on runs the Clawdbot gateway daemon on Home Assistant, providing WhatsApp integration via Baileys. Users install via the HA add-on store and link WhatsApp through a web UI.

## File Structure

```
clawdbot/
├── repository.json              # HA add-on repository metadata
├── Dockerfile.ha-addon          # For GitHub Actions builds (COPY-based)
├── .github/workflows/
│   └── ha-addon.yml             # CI: builds and pushes to ghcr.io
└── clawdbot-gateway/            # Add-on folder (name must match slug)
    ├── config.yaml              # Add-on configuration and metadata
    ├── Dockerfile               # For HA local builds (git clone-based)
    ├── build.yaml               # Architecture-specific base images
    ├── run.sh                   # Container entrypoint script
    ├── DOCS.md                  # User-facing documentation (shown in HA UI)
    └── CHANGELOG.md             # Version history (shown in HA UI)
```

## How Installation Works

### With Pre-built Images (Normal)

1. User adds `https://github.com/michaelhaessig/clawdbot` as add-on repository
2. HA reads `repository.json` and finds `clawdbot-gateway/config.yaml`
3. User clicks "Install" in HA UI
4. HA sees `image: ghcr.io/michaelhaessig/clawdbot-gateway-{arch}` in config.yaml
5. HA pulls the pre-built image (~30 seconds)
6. Add-on is ready

### Without Pre-built Images (Fallback)

If the image is unavailable or user removes the `image:` line:

1. HA uses `clawdbot-gateway/Dockerfile` with the add-on folder as build context
2. Dockerfile runs `git clone` to fetch full source (since context lacks src/)
3. Build takes 10-20 minutes on ARM64 (Home Assistant Green)

## Two Dockerfiles Explained

| File | Used By | Build Context | How it gets source |
|------|---------|---------------|-------------------|
| `Dockerfile.ha-addon` | GitHub Actions | Full repo | `COPY` commands |
| `clawdbot-gateway/Dockerfile` | HA local build | Add-on folder only | `git clone` |

**Why two?** When HA builds locally, it only provides the add-on folder as Docker build context. The main source code (`src/`, `package.json`) isn't available, so we must `git clone` it.

## Container Runtime

### Startup Sequence (run.sh)

1. Read configuration from HA options (`bashio::config`)
2. Create directories (`/config/clawdbot`, workspace)
3. Generate gateway token if not configured
4. Run non-interactive onboarding on first start (creates `clawdbot.json`)
5. Start gateway daemon with `exec node dist/index.js gateway-daemon`

### Environment Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `CLAWDBOT_STATE_DIR` | `/config/clawdbot` | Config, credentials, sessions |
| `CLAWDBOT_WORKSPACE_DIR` | `/share/clawdbot` | Agent workspace |
| `CLAWDBOT_GATEWAY_TOKEN` | Auto-generated or user-set | API authentication |
| `HOME` | `/config/clawdbot` | Node.js home directory |

### Volume Mapping

| HA Volume | Container Path | Contents |
|-----------|---------------|----------|
| `config` | `/config` | Persistent config (survives updates) |
| `share` | `/share` | Shared with other add-ons |

Data persistence:
```
/config/clawdbot/
├── clawdbot.json          # Main configuration
├── credentials/           # WhatsApp auth (Baileys)
└── .gateway_token         # Auto-generated API token

/share/clawdbot/           # Workspace for agent operations
```

### Ports

| Port | Purpose |
|------|---------|
| 18789 | Gateway API + Web UI (also via HA ingress) |
| 18790 | Bridge WebSocket |

## Updating the Add-on

### When Source Code Changes

Pre-built images are automatically rebuilt when:
- Push to `main` or `home-assistant` branch
- Changes to `src/**`, `package.json`, `pnpm-lock.yaml`, or `clawdbot-gateway/**`
- Manual workflow dispatch

Users get updates by:
1. HA checks for new image tags periodically
2. User clicks "Update" in add-on panel

### Releasing a New Version

1. **Update version** in `clawdbot-gateway/config.yaml`:
   ```yaml
   version: "1.1.0"
   ```

2. **Update CHANGELOG.md**:
   ```markdown
   ## 1.1.0
   - Added feature X
   - Fixed bug Y
   ```

3. **Commit and push** to `main` or `home-assistant` branch

4. **Create GitHub release** (optional, for versioned tags):
   - Tag: `v1.1.0` or `ha-1.1.0`
   - This triggers the workflow with the release tag

5. **GitHub Actions** builds and pushes:
   ```
   ghcr.io/michaelhaessig/clawdbot-gateway-aarch64:1.1.0
   ghcr.io/michaelhaessig/clawdbot-gateway-aarch64:latest
   ghcr.io/michaelhaessig/clawdbot-gateway-amd64:1.1.0
   ghcr.io/michaelhaessig/clawdbot-gateway-amd64:latest
   ```

### Manual Image Build

Trigger manually via GitHub Actions:
1. Go to Actions → "Build Home Assistant Add-on"
2. Click "Run workflow"
3. Optionally specify a version tag

Or build locally:
```bash
# For aarch64 (Home Assistant Green)
docker buildx build \
  --platform linux/arm64 \
  --build-arg BUILD_FROM=ghcr.io/home-assistant/aarch64-base-debian:bookworm \
  -f Dockerfile.ha-addon \
  -t ghcr.io/michaelhaessig/clawdbot-gateway-aarch64:latest \
  .

# For amd64
docker buildx build \
  --platform linux/amd64 \
  --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm \
  -f Dockerfile.ha-addon \
  -t ghcr.io/michaelhaessig/clawdbot-gateway-amd64:latest \
  .
```

## Configuration Options

Defined in `config.yaml` schema, exposed in HA UI:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gateway_bind` | string | `0.0.0.0` | Bind address |
| `gateway_port` | port | `18789` | Gateway API port |
| `bridge_port` | port | `18790` | Bridge WebSocket port |
| `gateway_token` | string? | (auto) | API token (auto-generated if empty) |
| `workspace` | string | `/share/clawdbot` | Agent workspace directory |

## Troubleshooting

### Check Logs
```bash
# Via HA UI: Add-on → Log tab
# Or via SSH:
docker logs addon_local_clawdbot-gateway
```

### Reset Configuration
```bash
# SSH into HA
rm -rf /config/clawdbot/clawdbot.json
# Restart add-on - will re-run onboarding
```

### Reset WhatsApp Session
```bash
rm -rf /config/clawdbot/credentials/
# Restart add-on, then scan QR again via web UI
```

### Force Rebuild (without pre-built image)
1. Edit `clawdbot-gateway/config.yaml`
2. Comment out or remove the `image:` line
3. Reinstall the add-on (will build from Dockerfile)

## Architecture Notes

### Debian Linux (glibc)
Both build and runtime stages use Debian Bookworm (glibc) for maximum binary compatibility. This ensures:
- Pre-compiled Go binaries work out of the box (no musl/glibc issues)
- Native Node.js modules compile without issues
- Third-party tools and binaries can be added easily

The trade-off is a larger image size (~400-500 MB vs ~250-350 MB with Alpine), but the improved compatibility is worth it for a gateway that may need to run external tools.

### Process Management
- `init: true` in config.yaml ensures proper signal handling (PID 1 issues)
- HA Supervisor handles restart policy (equivalent to `restart: unless-stopped`)
- `exec` in run.sh replaces shell with node process for clean signal forwarding

### Ingress
- `ingress: true` allows accessing web UI through HA's proxy
- `ingress_stream: true` enables WebSocket proxying
- Users can also access directly via `http://<ha-ip>:18789`

## Comparison with docker-compose.yml

| Aspect | docker-compose | HA Add-on |
|--------|---------------|-----------|
| Config mount | `$CONFIG_DIR:/home/node/.clawdbot` | `/config` → `CLAWDBOT_STATE_DIR` |
| Workspace | `$WORKSPACE_DIR:/home/node/clawd` | `/share` → `CLAWDBOT_WORKSPACE_DIR` |
| Restart | `restart: unless-stopped` | HA Supervisor |
| Init | `init: true` | `init: true` |
| Network | Host ports | Host ports + HA ingress |

## Files to Update When Changing...

### Add-on version
- `clawdbot-gateway/config.yaml` → `version:`
- `clawdbot-gateway/CHANGELOG.md`

### Configuration options
- `clawdbot-gateway/config.yaml` → `options:` and `schema:`
- `clawdbot-gateway/run.sh` → read new options with `bashio::config`
- `clawdbot-gateway/DOCS.md` → document new options

### Base image version
- `clawdbot-gateway/build.yaml`
- `Dockerfile.ha-addon` (ARG default)
- `.github/workflows/ha-addon.yml` (build-args)

### Node.js version
- `clawdbot-gateway/Dockerfile` (FROM node:XX-bookworm-slim)
- `Dockerfile.ha-addon` (FROM node:XX-bookworm-slim)

### Runtime dependencies
- Both Dockerfiles → `apt-get install` in runtime stage

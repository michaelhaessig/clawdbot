#!/usr/bin/with-contenv bashio

set -euo pipefail

# Non-interactive container: suppress TTY prompts from git and pnpm
export GIT_TERMINAL_PROMPT=0
export CI=true

# =============================================================================
# OpenClaw Self-Updating Home Assistant Addon
# =============================================================================
# This script manages openclaw installation and updates in persistent storage.
# On first start, it clones and builds openclaw from the configured repository.
# On subsequent starts, it checks for updates based on the update_mode setting.
# =============================================================================

# === Configuration ===
APP_DIR="${OPENCLAW_APP_DIR:-/config/openclaw-app}"
STATE_DIR="${OPENCLAW_STATE_DIR:-/config/openclaw}"
BACKUP_DIR="${APP_DIR}.backup"
STAGING_DIR="${APP_DIR}.new"
INSTALL_MARKER="${APP_DIR}/.install-marker"

# Read addon configuration with defaults
OPENCLAW_REPO=$(bashio::config 'openclaw_repo' 'https://github.com/openclaw/openclaw.git')
OPENCLAW_VERSION=$(bashio::config 'openclaw_version' 'main')
UPDATE_MODE=$(bashio::config 'update_mode' 'auto')
PIN_VERSION=$(bashio::config 'pin_version' 'false')
GATEWAY_PORT=$(bashio::config 'gateway_port')
BRIDGE_PORT=$(bashio::config 'bridge_port')
GATEWAY_TOKEN=$(bashio::config 'gateway_token')
WORKSPACE=$(bashio::config 'workspace')
VACUUM_ENTITY=$(bashio::config 'vacuum_entity' || true)
GOG_KEYRING=$(bashio::config 'gog_keyring' || true)

# === Logging Helpers ===
log_info() { bashio::log.info "$1"; }
log_warn() { bashio::log.warning "$1"; }
log_error() { bashio::log.error "$1"; }

# === Version Helpers ===
# Note: These functions always return 0 (success) but output empty on failure.
# This avoids set -e triggering on command substitutions. Callers check for empty output.
get_remote_version() {
    local sha=""
    if [ -d "$APP_DIR/.git" ]; then
        # Fetch silently (redirect both stdout and stderr)
        git -c credential.helper= -C "$APP_DIR" fetch origin --tags >/dev/null 2>&1 || true
        # Try branch ref first (origin/NAME), then tag/direct ref (NAME)
        sha=$(git -C "$APP_DIR" rev-parse "origin/${OPENCLAW_VERSION}" 2>/dev/null) || \
        sha=$(git -C "$APP_DIR" rev-parse "${OPENCLAW_VERSION}" 2>/dev/null) || true
    fi
    printf '%s' "$sha"
}

get_local_version() {
    local sha=""
    if [ -d "$APP_DIR/.git" ]; then
        sha=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null) || true
    fi
    printf '%s' "$sha"
}

is_update_available() {
    local remote_sha local_sha
    remote_sha=$(get_remote_version)
    local_sha=$(get_local_version)
    [ -n "$remote_sha" ] && [ -n "$local_sha" ] && [ "$remote_sha" != "$local_sha" ]
}

# === Installation ===
install_openclaw() {
    log_info "=== Installing OpenClaw ==="
    log_info "Repository: ${OPENCLAW_REPO}"
    log_info "Version: ${OPENCLAW_VERSION}"
    log_info "This may take 15-25 minutes on ARM devices..."

    # Clean up any failed previous attempts
    rm -rf "$STAGING_DIR"

    # Clone repository (disable credential helpers to avoid prompts for public repos)
    log_info "Cloning repository..."
    if ! git -c credential.helper= clone --depth 1 --branch "$OPENCLAW_VERSION" "$OPENCLAW_REPO" "$STAGING_DIR"; then
        log_error "Failed to clone repository"
        return 1
    fi

    cd "$STAGING_DIR"

    # Install dependencies
    log_info "Installing dependencies (this takes a while on ARM)..."
    if ! pnpm install --frozen-lockfile; then
        log_error "Failed to install dependencies"
        return 1
    fi

    # Build application
    log_info "Building application..."
    if ! pnpm build; then
        log_error "Failed to build application"
        return 1
    fi

    # Build UI
    log_info "Building UI..."
    if ! pnpm ui:install; then
        log_error "Failed to install UI dependencies"
        return 1
    fi
    if ! pnpm ui:build; then
        log_error "Failed to build UI"
        return 1
    fi

    # Prune dev dependencies to save space
    log_info "Pruning dev dependencies..."
    pnpm prune --prod || true

    # Move to final location (atomic swap)
    if [ -d "$APP_DIR" ]; then
        log_info "Backing up previous installation..."
        rm -rf "$BACKUP_DIR"
        mv "$APP_DIR" "$BACKUP_DIR"
    fi
    mv "$STAGING_DIR" "$APP_DIR"

    # Create install marker
    {
        echo "version=$(git -C "$APP_DIR" rev-parse HEAD)"
        echo "timestamp=$(date -Iseconds)"
        echo "branch=$OPENCLAW_VERSION"
        echo "repo=$OPENCLAW_REPO"
    } > "$INSTALL_MARKER"

    log_info "=== Installation complete! ==="
    return 0
}

# === Update ===
update_openclaw() {
    log_info "=== Updating OpenClaw ==="

    # Backup current installation
    log_info "Backing up current installation..."
    rm -rf "$BACKUP_DIR"
    cp -a "$APP_DIR" "$BACKUP_DIR"

    cd "$APP_DIR"

    # Fetch latest changes (including tags)
    log_info "Fetching updates..."
    if ! git -c credential.helper= fetch origin --prune --tags; then
        log_error "Failed to fetch updates"
        return 1
    fi

    # Determine if version is a tag or branch and update accordingly
    log_info "Applying updates..."
    if git show-ref --verify --quiet "refs/tags/${OPENCLAW_VERSION}"; then
        # It's a tag - use checkout (tags don't rebase)
        log_info "Checking out tag ${OPENCLAW_VERSION}..."
        if ! git checkout --force "${OPENCLAW_VERSION}"; then
            log_error "Failed to checkout tag"
            return 1
        fi
    else
        # It's a branch - rebase onto origin
        if ! git rebase "origin/${OPENCLAW_VERSION}"; then
            log_error "Rebase failed, aborting update"
            git rebase --abort 2>/dev/null || true
            return 1
        fi
    fi

    # Reinstall dependencies (may have changed)
    log_info "Reinstalling dependencies..."
    if ! pnpm install --frozen-lockfile; then
        log_error "Failed to reinstall dependencies"
        return 1
    fi

    # Rebuild
    log_info "Rebuilding application..."
    if ! pnpm build; then
        log_error "Failed to rebuild application"
        return 1
    fi

    log_info "Rebuilding UI..."
    if ! pnpm ui:install; then
        log_error "Failed to reinstall UI dependencies"
        return 1
    fi
    if ! pnpm ui:build; then
        log_error "Failed to rebuild UI"
        return 1
    fi

    # Prune dev dependencies
    pnpm prune --prod || true

    # Update marker
    local old_version
    old_version=$(grep "^version=" "$INSTALL_MARKER" 2>/dev/null | cut -d= -f2 || echo "unknown")
    {
        echo "version=$(git rev-parse HEAD)"
        echo "timestamp=$(date -Iseconds)"
        echo "branch=$OPENCLAW_VERSION"
        echo "repo=$OPENCLAW_REPO"
        echo "updated_from=$old_version"
    } > "$INSTALL_MARKER"

    log_info "=== Update complete! ==="
    return 0
}

# === Rollback ===
rollback_openclaw() {
    if [ -d "$BACKUP_DIR" ]; then
        log_warn "Rolling back to previous version..."
        rm -rf "$APP_DIR"
        mv "$BACKUP_DIR" "$APP_DIR"
        log_info "Rollback complete"
        return 0
    else
        log_error "No backup available for rollback"
        return 1
    fi
}

# === Health Check ===
verify_installation() {
    [ -f "$APP_DIR/dist/index.js" ] && \
    [ -d "$APP_DIR/node_modules" ] && \
    [ -f "$APP_DIR/package.json" ]
}

# =============================================================================
# Main Startup Flow
# =============================================================================

# Migrate legacy state dir if needed (clawdbot -> openclaw)
LEGACY_STATE_DIR="/config/clawdbot"
LEGACY_APP_DIR="/config/clawdbot-app"
if [ -d "$LEGACY_STATE_DIR" ] && [ ! -d "$STATE_DIR" ]; then
    log_info "Migrating state directory: ${LEGACY_STATE_DIR} -> ${STATE_DIR}"
    mv "$LEGACY_STATE_DIR" "$STATE_DIR"
fi
if [ -d "$LEGACY_APP_DIR" ] && [ ! -d "$APP_DIR" ]; then
    log_info "Migrating app directory: ${LEGACY_APP_DIR} -> ${APP_DIR}"
    mv "$LEGACY_APP_DIR" "$APP_DIR"
fi

# Set up directories
mkdir -p "$STATE_DIR"
mkdir -p "$STATE_DIR/credentials"
mkdir -p "$WORKSPACE"
mkdir -p "$WORKSPACE/memory"

# Clean up stale gateway lock files from previous container runs
# (In Docker, the old PID might coincidentally exist as a different process)
rm -f "$STATE_DIR"/gateway.*.lock 2>/dev/null || true

# Log workspace skills
WORKSPACE_SKILLS_DIR="$WORKSPACE/skills"
if [ -d "$WORKSPACE_SKILLS_DIR" ] && [ "$(ls -A "$WORKSPACE_SKILLS_DIR" 2>/dev/null)" ]; then
    log_info "Workspace skills:"
    for skill_dir in "$WORKSPACE_SKILLS_DIR"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        log_info "  - $skill_name"
    done
fi

# Export environment variables (set both old and new names for compatibility)
export OPENCLAW_STATE_DIR="$STATE_DIR"
export OPENCLAW_WORKSPACE_DIR="$WORKSPACE"
export OPENCLAW_NO_RESPAWN=1
export HOME="$STATE_DIR"

# Symlink /root/.gemini to persistent storage so Gemini CLI works in interactive shells
# (interactive shells have HOME=/root, but we want credentials to persist)
if [ ! -L /root/.gemini ] && [ ! -d /root/.gemini ]; then
    mkdir -p "$STATE_DIR/.gemini"
    ln -s "$STATE_DIR/.gemini" /root/.gemini
fi

# Export vacuum entity for hac CLI (if configured)
if [ -n "${VACUUM_ENTITY:-}" ]; then
    export HAC_VACUUM_ENTITY="$VACUUM_ENTITY"
fi

# Export GOG keyring password (if configured)
if [ -n "${GOG_KEYRING:-}" ]; then
    export GOG_KEYRING_PASSWORD="$GOG_KEYRING"
fi

# Gateway token handling - token auth is required (auth "none" removed in v2026.1.29)
if [ -z "${GATEWAY_TOKEN}" ]; then
    # Check for legacy token file
    if [ -f "${STATE_DIR}/.gateway_token" ]; then
        GATEWAY_TOKEN=$(cat "${STATE_DIR}/.gateway_token")
        log_warn "Using legacy token from ${STATE_DIR}/.gateway_token"
        log_warn "Please set gateway_token in addon config and remove this file"
    else
        log_error "No gateway token configured! Gateway auth is required since v2026.1.29."
        log_error "Set gateway_token in the addon configuration and restart."
        exit 1
    fi
fi
export OPENCLAW_GATEWAY_TOKEN="${GATEWAY_TOKEN}"

# =============================================================================
# Installation / Update Logic
# =============================================================================

if [ ! -f "$INSTALL_MARKER" ] || ! verify_installation; then
    # First install or corrupted installation
    log_info "No valid installation found, performing initial install..."

    if ! install_openclaw; then
        log_error "Initial installation failed!"

        # Try rollback if backup exists (from previous corrupted install)
        if rollback_openclaw; then
            log_warn "Rolled back to backup version"
        else
            log_error "No backup available, cannot start"
            log_error "Please check network connectivity and try restarting the addon"
            exit 1
        fi
    fi
else
    # Existing installation - check for updates
    log_info "Found existing installation at ${APP_DIR}"

    case "$UPDATE_MODE" in
        disabled)
            log_info "Update checks disabled"
            ;;
        check)
            if is_update_available; then
                local_ver=$(get_local_version | head -c 7)
                remote_ver=$(get_remote_version | head -c 7)
                log_info "Update available! Current: ${local_ver}..., Latest: ${remote_ver}..."
                log_info "Set update_mode=auto to enable automatic updates"
            else
                log_info "Already at latest version"
            fi
            ;;
        auto)
            if [ "$PIN_VERSION" = "true" ]; then
                log_info "Version pinned, skipping auto-update"
            elif is_update_available; then
                local_ver=$(get_local_version | head -c 7)
                remote_ver=$(get_remote_version | head -c 7)
                log_info "Update available: ${local_ver}... -> ${remote_ver}..."

                if ! update_openclaw; then
                    log_error "Update failed, attempting rollback..."
                    if rollback_openclaw; then
                        log_warn "Rolled back to previous version, continuing..."
                    else
                        log_error "Rollback failed, continuing with current state..."
                    fi
                fi
            else
                log_info "Already at latest version"
            fi
            ;;
        *)
            log_warn "Unknown update_mode: ${UPDATE_MODE}, defaulting to check-only"
            ;;
    esac
fi

# Final verification
if ! verify_installation; then
    log_error "Installation verification failed after all attempts"
    log_error "The addon cannot start. Please check the logs and try reinstalling."
    exit 1
fi

# =============================================================================
# Create CLI wrappers in PATH
# =============================================================================
cat > /usr/local/bin/openclaw << 'WRAPPER'
#!/bin/sh
exec node /config/openclaw-app/dist/index.js "$@"
WRAPPER
chmod +x /usr/local/bin/openclaw
# Keep legacy name for backwards compatibility
ln -sf /usr/local/bin/openclaw /usr/local/bin/clawdbot
log_info "CLI available: openclaw <command> (also: clawdbot)"

# =============================================================================
# First Start Onboarding
# =============================================================================

# Check both new and legacy config file locations
CONFIG_FILE="${STATE_DIR}/openclaw.json"
LEGACY_CONFIG_FILE="${STATE_DIR}/clawdbot.json"
if [ ! -f "${CONFIG_FILE}" ] && [ -f "${LEGACY_CONFIG_FILE}" ]; then
    log_info "Migrating config: clawdbot.json -> openclaw.json"
    mv "${LEGACY_CONFIG_FILE}" "${CONFIG_FILE}"
fi

if [ ! -f "${CONFIG_FILE}" ]; then
    log_info "First start detected - running initial setup..."

    cd "$APP_DIR"
    node dist/index.js onboard \
        --non-interactive \
        --mode local \
        --workspace "${WORKSPACE}" \
        --gateway-port "${GATEWAY_PORT}" \
        --gateway-auth token \
        --gateway-token "${GATEWAY_TOKEN}" \
        --auth-choice skip \
        --skip-health \
        --skip-skills || {
            log_warn "Onboarding returned non-zero, continuing anyway..."
        }

    log_info "Initial setup complete"
fi

# Normalize config: ensure gateway settings are correct for HA addon
if [ -f "${CONFIG_FILE}" ]; then
    HA_GATEWAY_TOKEN="${GATEWAY_TOKEN}" node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('${CONFIG_FILE}', 'utf8'));
const token = process.env.HA_GATEWAY_TOKEN || '';
let changed = false;
if (!cfg.gateway) cfg.gateway = {};
if (!cfg.gateway.mode) { cfg.gateway.mode = 'local'; changed = true; }
// HA addon needs LAN binding for ingress access
if (cfg.gateway.bind !== 'lan') { cfg.gateway.bind = 'lan'; changed = true; }
// Token auth is always required
if (!cfg.gateway.auth) cfg.gateway.auth = {};
if (cfg.gateway.auth.mode !== 'token') { cfg.gateway.auth.mode = 'token'; changed = true; }
if (cfg.gateway.auth.token !== token) { cfg.gateway.auth.token = token; changed = true; }
// HA provides its own auth via ingress, so allow host-header origin fallback for non-loopback binding
if (!cfg.gateway.controlUi) cfg.gateway.controlUi = {};
if (!cfg.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback) { cfg.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback = true; changed = true; }
if (changed) fs.writeFileSync('${CONFIG_FILE}', JSON.stringify(cfg, null, 2));
" 2>/dev/null || true
fi

# =============================================================================
# Start Gateway
# =============================================================================

# Get version info for logging
INSTALLED_VERSION=$(grep "^version=" "$INSTALL_MARKER" 2>/dev/null | cut -d= -f2 | head -c 7 || echo "unknown")

log_info "=== Starting OpenClaw Gateway ==="
log_info "  Version: ${INSTALLED_VERSION}..."
log_info "  Repository: ${OPENCLAW_REPO}"
log_info "  Branch: ${OPENCLAW_VERSION}"
log_info "  Update Mode: ${UPDATE_MODE}"
log_info "  Gateway Port: ${GATEWAY_PORT}"
log_info "  Bridge Port: ${BRIDGE_PORT}"
log_info "  State Dir: ${STATE_DIR}"
log_info "  Workspace: ${WORKSPACE}"
if [ -n "${VACUUM_ENTITY:-}" ]; then
    log_info "  Vacuum Entity: ${VACUUM_ENTITY}"
fi
log_info ""
log_info "Access the web UI through Home Assistant's sidebar or at:"
log_info "  http://<your-ha-ip>:${GATEWAY_PORT}"
log_info ""
log_info "To link WhatsApp, open the web UI and go to Connections > WhatsApp"
log_info ""
log_info "Custom skills: Add to ${WORKSPACE}/skills/ (no rebuild required)"

cd "$APP_DIR"

# Use exec to replace shell with node process for proper signal handling
# This ensures HA can restart the addon on failure
exec node dist/index.js gateway \
    --port "${GATEWAY_PORT}" \
    --allow-unconfigured

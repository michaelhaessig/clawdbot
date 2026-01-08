#!/usr/bin/with-contenv bashio

set -euo pipefail

# Disable git credential prompts (required for non-interactive container)
export GIT_TERMINAL_PROMPT=0

# =============================================================================
# Clawdbot Self-Updating Home Assistant Addon
# =============================================================================
# This script manages clawdbot installation and updates in persistent storage.
# On first start, it clones and builds clawdbot from the configured repository.
# On subsequent starts, it checks for updates based on the update_mode setting.
# =============================================================================

# === Configuration ===
APP_DIR="${CLAWDBOT_APP_DIR:-/config/clawdbot-app}"
STATE_DIR="${CLAWDBOT_STATE_DIR:-/config/clawdbot}"
BACKUP_DIR="${APP_DIR}.backup"
STAGING_DIR="${APP_DIR}.new"
INSTALL_MARKER="${APP_DIR}/.install-marker"

# Read addon configuration with defaults
CLAWDBOT_REPO=$(bashio::config 'clawdbot_repo' 'https://github.com/steipete/clawdbot.git')
CLAWDBOT_VERSION=$(bashio::config 'clawdbot_version' 'main')
UPDATE_MODE=$(bashio::config 'update_mode' 'auto')
PIN_VERSION=$(bashio::config 'pin_version' 'false')
GATEWAY_PORT=$(bashio::config 'gateway_port')
BRIDGE_PORT=$(bashio::config 'bridge_port')
GATEWAY_TOKEN=$(bashio::config 'gateway_token')
WORKSPACE=$(bashio::config 'workspace')
VACUUM_ENTITY=$(bashio::config 'vacuum_entity' || true)

# === Logging Helpers ===
log_info() { bashio::log.info "$1"; }
log_warn() { bashio::log.warning "$1"; }
log_error() { bashio::log.error "$1"; }

# === Version Helpers ===
get_remote_version() {
    if [ -d "$APP_DIR/.git" ]; then
        git -C "$APP_DIR" fetch origin --tags 2>/dev/null || return 1
        git -C "$APP_DIR" rev-parse "origin/${CLAWDBOT_VERSION}" 2>/dev/null || \
        git -C "$APP_DIR" rev-parse "${CLAWDBOT_VERSION}" 2>/dev/null
    fi
}

get_local_version() {
    if [ -d "$APP_DIR/.git" ]; then
        git -C "$APP_DIR" rev-parse HEAD 2>/dev/null
    fi
}

is_update_available() {
    local remote_sha
    local local_sha
    remote_sha=$(get_remote_version) || return 1
    local_sha=$(get_local_version) || return 1
    [ -n "$remote_sha" ] && [ -n "$local_sha" ] && [ "$remote_sha" != "$local_sha" ]
}

# === Installation ===
install_clawdbot() {
    log_info "=== Installing Clawdbot ==="
    log_info "Repository: ${CLAWDBOT_REPO}"
    log_info "Version: ${CLAWDBOT_VERSION}"
    log_info "This may take 15-25 minutes on ARM devices..."

    # Clean up any failed previous attempts
    rm -rf "$STAGING_DIR"

    # Clone repository
    log_info "Cloning repository..."
    if ! git clone --depth 1 --branch "$CLAWDBOT_VERSION" "$CLAWDBOT_REPO" "$STAGING_DIR"; then
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
        echo "branch=$CLAWDBOT_VERSION"
        echo "repo=$CLAWDBOT_REPO"
    } > "$INSTALL_MARKER"

    log_info "=== Installation complete! ==="
    return 0
}

# === Update ===
update_clawdbot() {
    log_info "=== Updating Clawdbot ==="

    # Backup current installation
    log_info "Backing up current installation..."
    rm -rf "$BACKUP_DIR"
    cp -a "$APP_DIR" "$BACKUP_DIR"

    cd "$APP_DIR"

    # Fetch latest changes
    log_info "Fetching updates..."
    if ! git fetch origin --all --prune; then
        log_error "Failed to fetch updates"
        return 1
    fi

    # Rebase onto latest
    log_info "Applying updates..."
    if ! git rebase "origin/${CLAWDBOT_VERSION}"; then
        log_error "Rebase failed, aborting update"
        git rebase --abort 2>/dev/null || true
        return 1
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
        echo "branch=$CLAWDBOT_VERSION"
        echo "repo=$CLAWDBOT_REPO"
        echo "updated_from=$old_version"
    } > "$INSTALL_MARKER"

    log_info "=== Update complete! ==="
    return 0
}

# === Rollback ===
rollback_clawdbot() {
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

# Set up directories
mkdir -p "$STATE_DIR"
mkdir -p "$STATE_DIR/credentials"
mkdir -p "$WORKSPACE"

# =============================================================================
# Skills Setup
# =============================================================================
# Skills are loaded from three locations (highest to lowest priority):
#   1. Workspace skills: $WORKSPACE/skills (user-owned, editable without rebuild)
#   2. Managed skills:   ~/.clawdbot/skills (addon-provided skills)
#   3. Bundled skills:   shipped with clawdbot installation
# =============================================================================

# Workspace skills dir - users can add custom skills here without rebuilding
WORKSPACE_SKILLS_DIR="$WORKSPACE/skills"
mkdir -p "$WORKSPACE_SKILLS_DIR"

# Managed skills dir: ~/.clawdbot/skills (HOME will be set to STATE_DIR)
MANAGED_SKILLS_DIR="$STATE_DIR/.clawdbot/skills"
mkdir -p "$MANAGED_SKILLS_DIR"

# Install addon-bundled skills (from /opt/addon-skills to managed skills dir)
ADDON_SKILLS_DIR="/opt/addon-skills"
if [ -d "$ADDON_SKILLS_DIR" ] && [ "$(ls -A "$ADDON_SKILLS_DIR" 2>/dev/null)" ]; then
    log_info "Installing addon-bundled skills to managed dir..."
    for skill_dir in "$ADDON_SKILLS_DIR"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        target_dir="$MANAGED_SKILLS_DIR/$skill_name"
        # Always update addon skills (overwrite with latest from image)
        rm -rf "$target_dir"
        cp -r "$skill_dir" "$target_dir"
        log_info "  Installed: $skill_name"
    done
fi

# Log workspace skills if any exist
if [ -d "$WORKSPACE_SKILLS_DIR" ] && [ "$(ls -A "$WORKSPACE_SKILLS_DIR" 2>/dev/null)" ]; then
    log_info "Found workspace skills (user-added):"
    for skill_dir in "$WORKSPACE_SKILLS_DIR"/*; do
        [ -d "$skill_dir" ] || continue
        skill_name=$(basename "$skill_dir")
        log_info "  Found: $skill_name"
    done
fi

# Export environment variables
export CLAWDBOT_STATE_DIR="$STATE_DIR"
export CLAWDBOT_WORKSPACE_DIR="$WORKSPACE"
export HOME="$STATE_DIR"

# Export vacuum entity for hac CLI (if configured)
if [ -n "${VACUUM_ENTITY:-}" ]; then
    export HAC_VACUUM_ENTITY="$VACUUM_ENTITY"
fi

# Gateway token handling
if [ -z "${GATEWAY_TOKEN}" ]; then
    if [ -f "${STATE_DIR}/.gateway_token" ]; then
        GATEWAY_TOKEN=$(cat "${STATE_DIR}/.gateway_token")
    else
        GATEWAY_TOKEN=$(head -c 32 /dev/urandom | xxd -p)
        echo "${GATEWAY_TOKEN}" > "${STATE_DIR}/.gateway_token"
        log_info "Generated new gateway token: ${GATEWAY_TOKEN}"
    fi
fi
export CLAWDBOT_GATEWAY_TOKEN="${GATEWAY_TOKEN}"

# =============================================================================
# Installation / Update Logic
# =============================================================================

if [ ! -f "$INSTALL_MARKER" ] || ! verify_installation; then
    # First install or corrupted installation
    log_info "No valid installation found, performing initial install..."

    if ! install_clawdbot; then
        log_error "Initial installation failed!"

        # Try rollback if backup exists (from previous corrupted install)
        if rollback_clawdbot; then
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

                if ! update_clawdbot; then
                    log_error "Update failed, attempting rollback..."
                    if rollback_clawdbot; then
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
# First Start Onboarding
# =============================================================================

CONFIG_FILE="${STATE_DIR}/clawdbot.json"
if [ ! -f "${CONFIG_FILE}" ]; then
    log_info "First start detected - running initial setup..."

    # Determine auth mode based on token
    AUTH_MODE="token"
    if [ -z "${GATEWAY_TOKEN}" ]; then
        AUTH_MODE="off"
    fi

    cd "$APP_DIR"
    node dist/index.js onboard \
        --non-interactive \
        --mode local \
        --workspace "${WORKSPACE}" \
        --gateway-bind "lan" \
        --gateway-port "${GATEWAY_PORT}" \
        --gateway-auth "${AUTH_MODE}" \
        --gateway-token "${GATEWAY_TOKEN}" \
        --auth-choice skip \
        --skip-health \
        --skip-skills || {
            log_warn "Onboarding returned non-zero, continuing anyway..."
        }

    log_info "Initial setup complete"
fi

# =============================================================================
# Start Gateway
# =============================================================================

# Get version info for logging
INSTALLED_VERSION=$(grep "^version=" "$INSTALL_MARKER" 2>/dev/null | cut -d= -f2 | head -c 7 || echo "unknown")

log_info "=== Starting Clawdbot Gateway ==="
log_info "  Version: ${INSTALLED_VERSION}..."
log_info "  Repository: ${CLAWDBOT_REPO}"
log_info "  Branch: ${CLAWDBOT_VERSION}"
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
exec node dist/index.js gateway-daemon \
    --bind "lan" \
    --port "${GATEWAY_PORT}"

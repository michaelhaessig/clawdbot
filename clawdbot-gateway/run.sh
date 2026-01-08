#!/usr/bin/with-contenv bashio

set -euo pipefail

# Read configuration from Home Assistant
# Note: gateway_bind now uses modes: "loopback", "tailnet", "lan", "auto"
# For HA addon, we always use "lan" to bind to all interfaces (0.0.0.0)
GATEWAY_BIND="lan"
GATEWAY_PORT=$(bashio::config 'gateway_port')
BRIDGE_PORT=$(bashio::config 'bridge_port')
GATEWAY_TOKEN=$(bashio::config 'gateway_token')
WORKSPACE=$(bashio::config 'workspace')
VACUUM_ENTITY=$(bashio::config 'vacuum_entity' || true)

# Set up directories
mkdir -p /config/clawdbot
mkdir -p /config/clawdbot/credentials
mkdir -p "${WORKSPACE}"

# Export environment variables
export CLAWDBOT_STATE_DIR=/config/clawdbot
export CLAWDBOT_WORKSPACE_DIR="${WORKSPACE}"
export HOME=/config/clawdbot

# Export vacuum entity for hac CLI (if configured)
if [ -n "${VACUUM_ENTITY:-}" ]; then
    export HAC_VACUUM_ENTITY="${VACUUM_ENTITY}"
fi

# Generate token if not provided
if [ -z "${GATEWAY_TOKEN}" ]; then
    if [ -f "${CLAWDBOT_STATE_DIR}/.gateway_token" ]; then
        GATEWAY_TOKEN=$(cat "${CLAWDBOT_STATE_DIR}/.gateway_token")
    else
        GATEWAY_TOKEN=$(head -c 32 /dev/urandom | xxd -p)
        echo "${GATEWAY_TOKEN}" > "${CLAWDBOT_STATE_DIR}/.gateway_token"
        bashio::log.info "Generated new gateway token: ${GATEWAY_TOKEN}"
    fi
fi
export CLAWDBOT_GATEWAY_TOKEN="${GATEWAY_TOKEN}"

cd /app

# Run non-interactive onboarding on first start
CONFIG_FILE="${CLAWDBOT_STATE_DIR}/clawdbot.json"
if [ ! -f "${CONFIG_FILE}" ]; then
    bashio::log.info "First start detected - running initial setup..."

    # Determine auth mode based on token
    AUTH_MODE="token"
    if [ -z "${GATEWAY_TOKEN}" ]; then
        AUTH_MODE="off"
    fi

    node dist/index.js onboard \
        --non-interactive \
        --mode local \
        --workspace "${WORKSPACE}" \
        --gateway-bind "${GATEWAY_BIND}" \
        --gateway-port "${GATEWAY_PORT}" \
        --gateway-auth "${AUTH_MODE}" \
        --gateway-token "${GATEWAY_TOKEN}" \
        --auth-choice skip \
        --skip-health \
        --skip-skills || {
            bashio::log.warning "Onboarding returned non-zero, continuing anyway..."
        }

    bashio::log.info "Initial setup complete"
fi

bashio::log.info "Starting Clawdbot Gateway..."
bashio::log.info "  Bind: ${GATEWAY_BIND}"
bashio::log.info "  Gateway Port: ${GATEWAY_PORT}"
bashio::log.info "  Bridge Port: ${BRIDGE_PORT}"
bashio::log.info "  State Dir: ${CLAWDBOT_STATE_DIR}"
bashio::log.info "  Workspace Dir: ${WORKSPACE}"
if [ -n "${VACUUM_ENTITY:-}" ]; then
    bashio::log.info "  Vacuum Entity: ${VACUUM_ENTITY}"
fi
bashio::log.info ""
bashio::log.info "Access the web UI through Home Assistant's sidebar or at:"
bashio::log.info "  http://<your-ha-ip>:${GATEWAY_PORT}"
bashio::log.info ""
bashio::log.info "To link WhatsApp, open the web UI and go to Connections > WhatsApp"

exec node dist/index.js gateway-daemon \
    --bind "${GATEWAY_BIND}" \
    --port "${GATEWAY_PORT}"

# Clawdbot Gateway - Home Assistant Add-on

WhatsApp gateway with AI agent capabilities for Home Assistant.

## Installation

### From GitHub Repository (recommended)

1. Add this repository to your Home Assistant add-on store:
   - Go to **Settings** > **Add-ons** > **Add-on Store**
   - Click the three dots (⋮) in the top right corner
   - Select **Repositories**
   - Add: `https://github.com/michaelhaessig/clawdbot`
   - Click **Add** then **Close**

2. Refresh the page (or wait a moment)

3. Find "Clawdbot Gateway" in the add-on store and click **Install**
   - Note: First install takes 10-20 minutes on Home Assistant Green (ARM64) as it builds from source

4. Configure the add-on (see Configuration below)

5. Start the add-on

### Local Installation (for development)

```bash
# SSH into Home Assistant
ssh root@homeassistant.local -p 22222

# Create local add-ons directory and copy files
mkdir -p /addons/clawdbot-gateway
# Then copy the clawdbot-gateway folder contents to /addons/clawdbot-gateway/
```

Then: **Settings** → **Add-ons** → **Add-on Store** → **⋮** → **Check for updates**

The add-on will appear under "Local add-ons".

## Initial Setup - Linking WhatsApp

After starting the add-on, you need to link your WhatsApp account:

1. **Open the Web UI** - Click "OPEN WEB UI" in the add-on panel, or access it via the sidebar if panel mode is enabled

2. **Navigate to Connections** - In the web UI, go to the Connections section

3. **Link WhatsApp** - Click on WhatsApp and follow the QR code login:
   - A QR code will be displayed
   - Open WhatsApp on your phone
   - Go to **Settings** > **Linked Devices** > **Link a Device**
   - Scan the QR code

4. **Verify Connection** - Once scanned, the status should change to "Connected"

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| `gateway_bind` | IP address to bind the gateway | `0.0.0.0` |
| `gateway_port` | Port for the Gateway API / Web UI | `18789` |
| `bridge_port` | Port for the Bridge WebSocket | `18790` |
| `gateway_token` | Authentication token (auto-generated if empty) | (empty) |
| `workspace` | Directory for agent workspace files | `/share/clawdbot` |

### Example Configuration

```yaml
gateway_bind: "0.0.0.0"
gateway_port: 18789
bridge_port: 18790
gateway_token: "your-secure-token-here"
workspace: "/share/clawdbot"
```

## Network

The add-on exposes the following ports:

- **18789**: Gateway REST API and Web UI (also available via Home Assistant ingress)
- **18790**: Bridge WebSocket connection

## Data Storage

- **Config**: `/config/clawdbot` - Stores credentials, session data, and configuration
- **Workspace**: `/share/clawdbot` (default) - Workspace for agent operations, accessible to other add-ons

## Accessing the Web UI

There are two ways to access the Clawdbot web interface:

1. **Via Home Assistant Ingress** (recommended)
   - Click "OPEN WEB UI" in the add-on panel
   - Or enable "Show in sidebar" for quick access

2. **Direct Access**
   - Navigate to `http://<your-ha-ip>:18789`
   - Useful for external access or debugging

## Troubleshooting

### WhatsApp Won't Connect

1. Open the web UI and check the Connections page
2. If disconnected, click "Relink" to generate a new QR code
3. Make sure your phone has a stable internet connection
4. Check the add-on logs for specific error messages

### QR Code Expired

QR codes expire after a few minutes. If the QR expires before scanning:
1. Refresh the Connections page in the web UI
2. Request a new QR code

### Session Logged Out

If WhatsApp reports the session is logged out:
1. This can happen if you link too many devices or unlink from your phone
2. Go to the web UI > Connections > WhatsApp
3. Click "Relink" to start fresh

### Token Issues

If you see authentication errors when connecting to the gateway:
1. Check that `gateway_token` in the add-on config matches what your clients are using
2. If the token field is empty, a token was auto-generated - find it in `/config/clawdbot/.gateway_token`
3. The token is also shown in the add-on logs on first start

### Viewing Logs

Check the add-on logs for detailed information:
- Go to the add-on page in Home Assistant
- Click on the "Log" tab
- Enable "Auto refresh" for live updates

## Architecture

```
Home Assistant
├── Clawdbot Add-on
│   ├── Gateway Daemon (port 18789)
│   │   ├── REST API
│   │   ├── Web UI
│   │   └── WhatsApp connection (Baileys)
│   └── Bridge WebSocket (port 18790)
│
├── /config/clawdbot/     (persistent config)
└── /share/clawdbot/      (workspace)
```

## Support

For issues and feature requests, please visit:
https://github.com/michaelhaessig/clawdbot/issues

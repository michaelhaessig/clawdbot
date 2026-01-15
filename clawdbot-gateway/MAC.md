# Mac Clawdbot Setup

This guide covers setting up Clawdbot on macOS to act as a remote browser node for the Home Assistant gateway.

## Architecture

```
┌─────────────────────────┐      Bridge       ┌──────────────────────────┐
│  HA Gateway             │  ◄──────────────► │  Mac (as Node)           │
│  192.168.1.200          │   WebSocket       │  runs Clawdbot.app       │
│                         │   (port 18790)    │  exposes system.run      │
└─────────────────────────┘                   └──────────────────────────┘
```

The Mac connects to the HA gateway as a **node** and exposes:
- `system.run` - Execute commands remotely
- `canvas.*` - WebView control
- `screen.record` - Screen recording
- `camera.*` - Camera access (if enabled)

## Prerequisites

- **macOS 15+** (Sequoia)
- **Xcode 16+** with Swift 6.2 (for building from source)
- **Node.js 22+**
- **pnpm**

## Quick Start (From Source)

### 1. Clone and Build CLI

```bash
cd /Users/michaelhaessig/code/michaelhaessig/clawdbot

# Initialize submodules
git submodule update --init --recursive

# Install dependencies
pnpm install

# Build CLI
pnpm build

# Link globally (requires pnpm setup first)
pnpm setup  # Adds PNPM_HOME to PATH
source ~/.zshrc
pnpm link --global

# Verify
clawdbot --version
```

### 2. Build macOS App

```bash
# Accept Xcode license (if prompted)
sudo xcodebuild -license accept

# Build with ad-hoc signing
ALLOW_ADHOC_SIGNING=1 ./scripts/package-mac-app.sh

# Output: dist/Clawdbot.app
```

### 3. Launch App

```bash
open dist/Clawdbot.app
```

## Configure Remote Mode

1. **Click the Clawdbot icon** in the menu bar
2. **Open Settings** (gear icon)
3. **Go to General tab**
4. **Under "Clawdbot runs"**, select **"Remote over SSH"**
5. **Set SSH target**: `root@192.168.1.200` (HA server)
6. **Click "Test remote"** to verify connection

## HA Server Requirements

On the Home Assistant server (192.168.1.200):

1. Gateway running with bridge enabled (port 18790)
2. SSH access configured for the Mac
3. `clawdbot` CLI on PATH

## Remote Connection Setup (Detailed)

This section explains how the Mac connects to the HA gateway as a node using SSH tunnels.

### Connection Flow

```
┌──────────────────┐                              ┌──────────────────┐
│  Mac             │                              │  HA Server       │
│                  │                              │                  │
│  Clawdbot.app    │──── SSH Tunnel ────────────►│  SSH Server      │
│  (Node Mode)     │     (localhost:18790)       │  (port 22)       │
│                  │                              │       │          │
│                  │◄─── WebSocket ──────────────│       ▼          │
│                  │     (via tunnel)            │  Bridge:18790    │
└──────────────────┘                              └──────────────────┘
```

The Mac app establishes an SSH local port forward (`-L 18790:127.0.0.1:18790`) and connects to the bridge through it.

### Step 1: Enable SSH TCP Forwarding on HA

**Critical**: The Home Assistant SSH addon blocks TCP forwarding by default.

1. Go to **Settings → Add-ons → Terminal & SSH → Configuration**
2. Enable **"Allow TCP forwarding"**
3. Click **Save** and **Restart** the addon

Without this, SSH tunnels will fail with `"administratively prohibited"`.

### Step 2: Configure Mac for Remote Mode

Edit `~/.clawdbot/clawdbot.json` on the Mac:

```json
{
  "gateway": {
    "mode": "remote",
    "port": 18789,
    "remote": {
      "url": "ws://192.168.1.200:18789"
    },
    "auth": {
      "mode": "token",
      "token": "your-gateway-token"
    }
  }
}
```

**Important**: Set `remote.url` to the gateway port (18789), not the bridge port. The Mac app calculates the bridge port as `gatewayPort + 1`.

Also set the connection mode in UserDefaults:

```bash
defaults write com.clawdbot.mac.debug "clawdbot.connectionMode" -string "remote"
```

### Step 3: Node Pairing

When the Mac first connects, it triggers a pairing request:

1. Mac connects to bridge without a token
2. Bridge returns `NOT_PAIRED` error
3. Mac sends a pairing request with device info
4. Admin approves the request on HA:
   ```bash
   # List pending pairing requests
   clawdbot nodes pairing

   # Approve a request (use the request ID from above)
   clawdbot nodes approve <request-id>
   ```
5. Bridge issues a token to the Mac
6. Mac stores token and reconnects as authenticated node

### Step 4: Verify Connection

On the HA server:

```bash
# List connected nodes
clawdbot nodes list

# Test command execution
clawdbot nodes run --node mac-XXXX -- echo 'Hello from HA!'
```

### Token Storage

The Mac stores its node token in UserDefaults:

```bash
# View stored token
defaults read com.clawdbot.shared "mac.node.bridge.token"

# Manually set token (if needed)
defaults write com.clawdbot.shared "mac.node.bridge.token" -string "<token>"
```

### Ports Reference

| Port  | Service         | Description                    |
|-------|-----------------|--------------------------------|
| 18789 | Gateway         | Main gateway WebSocket         |
| 18790 | Bridge          | Node connection bridge         |
| 18791 | Browser Control | Browser automation server      |
| 18793 | Canvas Host     | Canvas/WebView hosting         |

## Using Browser via system.run

Once connected, run browser commands on the Mac from the HA server:

```bash
# List nodes (Mac should appear)
clawdbot nodes status

# Run browser commands on Mac
clawdbot nodes run --node <mac-node-id> -- clawdbot browser status
clawdbot nodes run --node <mac-node-id> -- clawdbot browser start
clawdbot nodes run --node <mac-node-id> -- clawdbot browser open https://example.com
clawdbot nodes run --node <mac-node-id> -- clawdbot browser snapshot --format aria
```

## Troubleshooting

### Xcode License Not Accepted
```bash
sudo xcodebuild -license accept
```

### Swift Version Mismatch
The macOS app requires Swift 6.2. Update Xcode to 16+ via App Store.

### pnpm Not Found After Install
```bash
pnpm setup
source ~/.zshrc
```

### App Crashes on Permission Grant
Reset TCC permissions:
```bash
tccutil reset All com.clawdbot.mac.debug
```

### SSH Connection Fails
- Verify SSH access: `ssh root@192.168.1.200`
- Ensure `clawdbot` is on PATH on remote host
- Check gateway is running: `clawdbot status`

## Ad-Hoc Signing Limitations

Ad-hoc signed apps don't persist macOS permissions. After each rebuild:
- Re-grant Accessibility, Microphone, Screen Recording permissions
- Some permissions may require a macOS restart to reappear

For persistent permissions, sign with an Apple Developer certificate.

## File Locations

| Item | Path |
|------|------|
| App bundle | `dist/Clawdbot.app` |
| Config | `~/.clawdbot/clawdbot.json` |
| CLI (linked) | `~/Library/pnpm/clawdbot` |
| Source | `/Users/michaelhaessig/code/michaelhaessig/clawdbot` |

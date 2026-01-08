---
name: ha-vacuum
description: Control Roborock/vacuum devices via Home Assistant using hac CLI.
homepage: https://www.home-assistant.io/integrations/roborock/
metadata: {"clawdbot":{"emoji":"🤖","skillKey":"ha-vacuum","requires":{"bins":["hac"],"env":["SUPERVISOR_TOKEN"]}}}
---

# Home Assistant Vacuum Control (hac)

Control Roborock and other vacuum cleaners via Home Assistant using the `hac` CLI.

## Prerequisites

- Running as HA add-on (SUPERVISOR_TOKEN auto-injected), OR
- External access with HA_TOKEN and HA_URL environment variables
- Roborock integration configured in Home Assistant

## Quick Start

```bash
# Check connection
hac ping

# Get vacuum status
hac vacuum status

# Start cleaning
hac vacuum start
```

## Cleaning Settings

### Fan Speed (Suction Power)

```bash
# Show current fan speed and available options
hac vacuum fan

# Set fan speed
hac vacuum fan off        # No suction (mop only)
hac vacuum fan silent     # Quiet mode
hac vacuum fan balanced   # Normal (default)
hac vacuum fan turbo      # High suction
hac vacuum fan max        # Maximum power
```

### Mop Mode (Route/Pattern)

```bash
# Show current mop mode and available options
hac vacuum mop

# Set mop mode (controls HOW the mop moves)
hac vacuum mop off         # No mopping
hac vacuum mop standard    # Standard pattern
hac vacuum mop deep        # Deep cleaning (slower)
hac vacuum mop deep_plus   # Maximum coverage
```

### Water/Mop Intensity

```bash
# Show current water level and available options
hac vacuum water

# Set water intensity (controls HOW MUCH water)
hac vacuum water off       # No water (vacuum only)
hac vacuum water low       # Light water, quick dry
hac vacuum water medium    # Medium water
hac vacuum water high      # Heavy water for stains
```

### Dust Collection (Auto-Empty Dock)

```bash
# Show current mode (requires auto-empty dock)
hac vacuum dust

# Set dust collection mode
hac vacuum dust off        # Don't auto-empty
hac vacuum dust light      # Light emptying
hac vacuum dust balanced   # Balanced
hac vacuum dust max        # Maximum emptying
hac vacuum dust smart      # Smart mode
```

### View All Settings

```bash
# Show all configurable settings at once
hac vacuum config
hac vacuum config --format json
```

## Room Cleaning

### List Available Rooms

```bash
hac vacuum rooms
hac vacuum rooms --format json
```

### Clean Specific Rooms

```bash
# Clean rooms by segment ID
hac vacuum clean -r 16,17

# Multiple passes
hac vacuum clean -r 16 --repeats 2

# With inline settings (applied before cleaning starts)
hac vacuum clean -r 16,17 --fan turbo
hac vacuum clean -r 16 --fan max --water off        # Vacuum only
hac vacuum clean -r 16 --fan off --water high       # Mop only
hac vacuum clean -r 16,17,18 --fan balanced --mop deep --water medium
```

## Basic Controls

```bash
# Start/stop
hac vacuum start
hac vacuum pause
hac vacuum stop

# Return to dock
hac vacuum dock

# Locate vacuum (play sound)
hac vacuum locate
```

## Status & Sensors

```bash
# Get vacuum status
hac vacuum status
hac vacuum status --format json

# Get battery level
hac vacuum battery

# Get all related sensors
hac vacuum sensors

# List all vacuum entities
hac vacuum list
```

## Navigation (Roborock)

```bash
# Get current position
hac vacuum position

# Go to coordinates (dock typically at 25500,25500)
hac vacuum goto 25500 25500
```

## Generic Get/Set

For model-specific settings not covered by dedicated commands:

```bash
# Get any select entity
hac vacuum get mop_mode
hac vacuum get selected_map

# Set any select entity
hac vacuum set mop_mode deep
hac vacuum set selected_map "Upstairs"
```

## State & Service Commands

### Query Entity States

```bash
hac state get sensor.roborock_s7_battery
hac state search roborock
hac state list --domain vacuum
```

### Call Services

```bash
hac service call vacuum.start --entity vacuum.roborock_s7
hac service list vacuum
hac service info vacuum.set_fan_speed
```

## Common Cleaning Scenarios

### Vacuum Only (No Mop)
```bash
hac vacuum fan max && hac vacuum water off && hac vacuum clean -r 16,17
# Or inline:
hac vacuum clean -r 16,17 --fan max --water off
```

### Mop Only (No Vacuum)
```bash
hac vacuum fan off && hac vacuum water high && hac vacuum mop deep && hac vacuum clean -r 16
# Or inline:
hac vacuum clean -r 16 --fan off --water high --mop deep
```

### Quick Kitchen Clean
```bash
# Get room IDs first
hac vacuum rooms

# Quick clean with default settings
hac vacuum clean -r 16
```

### Deep Clean Specific Rooms
```bash
hac vacuum clean -r 16,17 --fan turbo --water medium --mop deep --repeats 2
```

### Check Status Before Cleaning
```bash
hac vacuum status
hac vacuum battery
hac vacuum config
```

## Multi-Vacuum Setup

```bash
# Override default vacuum entity
hac vacuum status --entity vacuum.roborock_q_revo
hac vacuum clean -r 16 --entity vacuum.upstairs_vacuum

# Or set environment variable
export HAC_VACUUM_ENTITY=vacuum.roborock_q_revo
hac vacuum status
```

## External Access (Non-Add-on)

```bash
# Create long-lived token in HA Profile
export HA_URL="http://192.168.1.100:8123"
export HA_TOKEN="your-long-lived-access-token"

# Test connection
hac ping
hac config
```

## Troubleshooting

```bash
# Test connectivity
hac ping

# Show HA config
hac config

# Verbose output
hac vacuum status --verbose

# Find entity names
hac vacuum list
hac state search vacuum
hac state search mop
hac state search roborock

# Check what settings are available
hac vacuum config
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SUPERVISOR_TOKEN` | Auto-injected in HA add-on mode | - |
| `HA_TOKEN` | Long-lived access token | - |
| `HA_URL` | Home Assistant URL | http://supervisor/core |
| `HAC_VACUUM_ENTITY` | Default vacuum entity | vacuum.roborock_s7 |

## Roborock Settings Reference

| Setting | Command | Entity Pattern | Options (vary by model) |
|---------|---------|----------------|------------------------|
| Fan Speed | `hac vacuum fan` | vacuum.* attribute | off, silent, balanced, turbo, max |
| Mop Mode | `hac vacuum mop` | select.*_mop_mode | off, standard, deep, deep_plus |
| Water Level | `hac vacuum water` | select.*_mop_intensity | off, low, medium, high |
| Dust Collection | `hac vacuum dust` | select.*_dust_collection_mode | off, light, balanced, max, smart |
| Selected Map | `hac vacuum set selected_map` | select.*_selected_map | (your map names) |

**Sources:**
- [Home Assistant Roborock Integration](https://www.home-assistant.io/integrations/roborock/)
- [Roborock Segment Cleaning Discussion](https://github.com/home-assistant/core/issues/103213)
- [HA Community: Roborock Vac & Mop Mode](https://community.home-assistant.io/t/roborock-s8-vac-mop-mode/692587)

import { Command } from "commander";
import {
  HAClient,
  resolveConfig,
  formatState,
  formatStates,
  type HAState,
} from "../client.js";

// Default vacuum entity (can be overridden via env or --entity)
const DEFAULT_VACUUM_ENTITY =
  process.env.HAC_VACUUM_ENTITY || "vacuum.roborock_s7";

// Known option values for validation (actual options may vary by model)
const FAN_SPEEDS = ["off", "silent", "balanced", "turbo", "max", "max_plus", "custom"];
const MOP_MODES = ["off", "standard", "deep", "deep_plus", "fast", "custom"];
const MOP_INTENSITIES = ["off", "low", "moderate", "medium", "high", "custom", "max"];
const DUST_MODES = ["off", "light", "balanced", "max", "smart"];

type VacuumOptions = {
  url?: string;
  token?: string;
  entity?: string;
  timeout?: number;
  verbose?: boolean;
  format?: "json" | "table" | "short";
};

function getClient(options: VacuumOptions): HAClient {
  return new HAClient(resolveConfig(options));
}

function getEntityId(options: VacuumOptions): string {
  return options.entity || DEFAULT_VACUUM_ENTITY;
}

function getDeviceName(entityId: string): string {
  return entityId.replace("vacuum.", "");
}

async function handleResult<T>(
  result: { ok: true; data: T } | { ok: false; error: string },
  successFn?: (data: T) => void
): Promise<void> {
  if (!result.ok) {
    console.error(`Error: ${result.error}`);
    process.exit(1);
  }
  if (successFn) {
    successFn(result.data);
  } else {
    console.log(JSON.stringify(result.data, null, 2));
  }
}

/**
 * Set a select entity option
 */
async function setSelectOption(
  client: HAClient,
  entityId: string,
  option: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  return client.callService("select", "select_option", {
    entity_id: entityId,
    option,
  });
}

/**
 * Get current value of a select entity
 */
async function getSelectValue(
  client: HAClient,
  entityId: string
): Promise<string | null> {
  const result = await client.getState(entityId);
  if (!result.ok) return null;
  return result.data.state;
}

/**
 * Get available options for a select entity
 */
async function getSelectOptions(
  client: HAClient,
  entityId: string
): Promise<string[] | null> {
  const result = await client.getState(entityId);
  if (!result.ok) return null;
  const options = result.data.attributes.options;
  return Array.isArray(options) ? options : null;
}

export function createVacuumCommand(): Command {
  const vacuum = new Command("vacuum")
    .description("Control Roborock/vacuum devices via Home Assistant")
    .addHelpText(
      "after",
      `
Environment Variables:
  HAC_VACUUM_ENTITY   Default vacuum entity ID (default: vacuum.roborock_s7)
  HA_URL              Home Assistant URL (default: http://supervisor/core)
  HA_TOKEN            Long-lived access token (for external access)
  SUPERVISOR_TOKEN    Auto-injected when running as HA add-on

Cleaning Settings:
  hac vacuum fan <speed>      Set suction power (off|silent|balanced|turbo|max)
  hac vacuum mop <mode>       Set mop route/pattern (standard|deep|deep_plus)
  hac vacuum water <level>    Set water/mop intensity (off|low|medium|high)
  hac vacuum dust <mode>      Set dust collection (off|light|balanced|max|smart)

Room Cleaning:
  hac vacuum rooms                          List available rooms
  hac vacuum clean -r 16,17                 Clean rooms 16 and 17
  hac vacuum clean -r 16 --fan max --water low   Clean with settings

Examples:
  $ hac vacuum status
  $ hac vacuum fan turbo && hac vacuum water low && hac vacuum clean -r 16,17
  $ hac vacuum clean -r 16,17 --fan turbo --water off --repeats 2
`
    );

  // Shared options
  const addCommonOptions = (cmd: Command): Command =>
    cmd
      .option("-u, --url <url>", "Home Assistant API URL")
      .option("-t, --token <token>", "Authentication token")
      .option(
        "-e, --entity <entity>",
        "Vacuum entity ID",
        DEFAULT_VACUUM_ENTITY
      )
      .option("--timeout <ms>", "Request timeout in ms", "30000")
      .option("-v, --verbose", "Enable verbose logging");

  // Status command
  addCommonOptions(
    vacuum
      .command("status")
      .description("Get vacuum status and attributes")
      .option("-f, --format <format>", "Output format: json|table|short", "table")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.getState(entityId);
    await handleResult(result, (state) => {
      console.log(formatState(state, options.format || "table"));
    });
  });

  // List command - find all vacuums
  addCommonOptions(
    vacuum
      .command("list")
      .description("List all vacuum entities")
      .option("-f, --format <format>", "Output format: json|table|short", "short")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const result = await client.getStatesMatching("^vacuum\\.");
    await handleResult(result, (states) => {
      if (states.length === 0) {
        console.log("No vacuum entities found");
        return;
      }
      console.log(formatStates(states, options.format || "short"));
    });
  });

  // Start command
  addCommonOptions(
    vacuum
      .command("start")
      .description("Start cleaning")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService("vacuum", "start", {
      entity_id: entityId,
    });
    await handleResult(result, () => {
      console.log(`Started cleaning: ${entityId}`);
    });
  });

  // Pause command
  addCommonOptions(
    vacuum
      .command("pause")
      .description("Pause cleaning")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService("vacuum", "pause", {
      entity_id: entityId,
    });
    await handleResult(result, () => {
      console.log(`Paused: ${entityId}`);
    });
  });

  // Stop command
  addCommonOptions(
    vacuum
      .command("stop")
      .description("Stop cleaning")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService("vacuum", "stop", {
      entity_id: entityId,
    });
    await handleResult(result, () => {
      console.log(`Stopped: ${entityId}`);
    });
  });

  // Dock / return to base command
  addCommonOptions(
    vacuum
      .command("dock")
      .alias("home")
      .description("Return to dock/charging base")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService("vacuum", "return_to_base", {
      entity_id: entityId,
    });
    await handleResult(result, () => {
      console.log(`Returning to dock: ${entityId}`);
    });
  });

  // Locate command
  addCommonOptions(
    vacuum
      .command("locate")
      .alias("find")
      .description("Make the vacuum play a sound to locate it")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService("vacuum", "locate", {
      entity_id: entityId,
    });
    await handleResult(result, () => {
      console.log(`Locating: ${entityId}`);
    });
  });

  // Fan speed command
  addCommonOptions(
    vacuum
      .command("fan [speed]")
      .description("Get or set fan/suction speed")
      .addHelpText(
        "after",
        `
Fan Speed Options (varies by model):
  off       - No suction (mop only mode)
  silent    - Quiet mode, lower power
  balanced  - Normal cleaning (default)
  turbo     - Higher suction for carpets
  max       - Maximum power
  max_plus  - Maximum+ (some models)
  custom    - Custom setting

Without argument, shows current fan speed and available options.

Examples:
  $ hac vacuum fan              # Show current speed
  $ hac vacuum fan turbo        # Set to turbo
  $ hac vacuum fan off          # Mop-only mode
`
      )
  ).action(async (speed: string | undefined, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);

    if (!speed) {
      // Show current fan speed from vacuum entity
      const result = await client.getState(entityId);
      await handleResult(result, (state) => {
        const currentSpeed = state.attributes.fan_speed || "unknown";
        const speedList = state.attributes.fan_speed_list;
        console.log(`Current fan speed: ${currentSpeed}`);
        if (Array.isArray(speedList)) {
          console.log(`Available speeds: ${speedList.join(", ")}`);
        }
      });
      return;
    }

    const result = await client.callService("vacuum", "set_fan_speed", {
      entity_id: entityId,
      fan_speed: speed.toLowerCase(),
    });
    await handleResult(result, () => {
      console.log(`Fan speed set to: ${speed}`);
    });
  });

  // Mop mode command
  addCommonOptions(
    vacuum
      .command("mop [mode]")
      .description("Get or set mop route/pattern mode")
      .addHelpText(
        "after",
        `
Mop Mode Options (varies by model):
  off        - No mopping
  standard   - Standard mopping pattern
  deep       - Deep cleaning (slower, more thorough)
  deep_plus  - Maximum coverage (S7 MaxV Ultra, etc.)
  fast       - Quick mopping
  custom     - Custom setting

This controls the mop ROUTE/PATTERN, not water amount.
Use 'hac vacuum water' to control water intensity.

Without argument, shows current mode and available options.

Examples:
  $ hac vacuum mop              # Show current mode
  $ hac vacuum mop deep         # Set deep cleaning
  $ hac vacuum mop off          # Disable mopping
`
      )
  ).action(async (mode: string | undefined, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const selectEntity = `select.${deviceName}_mop_mode`;

    if (!mode) {
      // Show current mop mode
      const current = await getSelectValue(client, selectEntity);
      const available = await getSelectOptions(client, selectEntity);
      if (current === null) {
        console.log(`Could not read mop mode (entity: ${selectEntity})`);
        console.log("Try: hac state search mop_mode");
        return;
      }
      console.log(`Current mop mode: ${current}`);
      if (available) {
        console.log(`Available modes: ${available.join(", ")}`);
      }
      return;
    }

    const result = await setSelectOption(client, selectEntity, mode.toLowerCase());
    await handleResult(result, () => {
      console.log(`Mop mode set to: ${mode}`);
    });
  });

  // Water/mop intensity command
  addCommonOptions(
    vacuum
      .command("water [level]")
      .alias("intensity")
      .description("Get or set mop water/intensity level")
      .addHelpText(
        "after",
        `
Water/Mop Intensity Options (varies by model):
  off       - No water (vacuum only)
  low       - Light water, quick dry
  moderate  - Moderate water
  medium    - Medium water
  high      - Heavy water for tough stains
  max       - Maximum water
  custom    - Custom water flow

This controls the WATER AMOUNT, not the mop pattern.
Use 'hac vacuum mop' to control mop route/pattern.

Without argument, shows current level and available options.

Examples:
  $ hac vacuum water            # Show current level
  $ hac vacuum water low        # Light water
  $ hac vacuum water off        # Vacuum only (no mop)
  $ hac vacuum water high       # Maximum water
`
      )
  ).action(async (level: string | undefined, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const selectEntity = `select.${deviceName}_mop_intensity`;

    if (!level) {
      // Show current water level
      const current = await getSelectValue(client, selectEntity);
      const available = await getSelectOptions(client, selectEntity);
      if (current === null) {
        console.log(`Could not read mop intensity (entity: ${selectEntity})`);
        console.log("Try: hac state search mop_intensity");
        return;
      }
      console.log(`Current water/mop intensity: ${current}`);
      if (available) {
        console.log(`Available levels: ${available.join(", ")}`);
      }
      return;
    }

    const result = await setSelectOption(client, selectEntity, level.toLowerCase());
    await handleResult(result, () => {
      console.log(`Water/mop intensity set to: ${level}`);
    });
  });

  // Dust collection mode command
  addCommonOptions(
    vacuum
      .command("dust [mode]")
      .description("Get or set auto-empty dock dust collection mode")
      .addHelpText(
        "after",
        `
Dust Collection Mode Options (for auto-empty dock models):
  off       - Don't auto-empty
  light     - Light emptying
  balanced  - Balanced emptying
  max       - Maximum emptying
  smart     - Smart mode (adjusts automatically)

Only available on vacuums with auto-empty docks.

Without argument, shows current mode and available options.

Examples:
  $ hac vacuum dust             # Show current mode
  $ hac vacuum dust smart       # Set smart mode
  $ hac vacuum dust off         # Disable auto-empty
`
      )
  ).action(async (mode: string | undefined, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const selectEntity = `select.${deviceName}_dust_collection_mode`;

    if (!mode) {
      // Show current dust mode
      const current = await getSelectValue(client, selectEntity);
      const available = await getSelectOptions(client, selectEntity);
      if (current === null) {
        console.log(`Could not read dust collection mode (entity: ${selectEntity})`);
        console.log("This setting requires an auto-empty dock.");
        console.log("Try: hac state search dust_collection");
        return;
      }
      console.log(`Current dust collection mode: ${current}`);
      if (available) {
        console.log(`Available modes: ${available.join(", ")}`);
      }
      return;
    }

    const result = await setSelectOption(client, selectEntity, mode.toLowerCase());
    await handleResult(result, () => {
      console.log(`Dust collection mode set to: ${mode}`);
    });
  });

  // Rooms command - list available rooms
  addCommonOptions(
    vacuum
      .command("rooms")
      .description("Get available maps and rooms (Roborock)")
      .option("-f, --format <format>", "Output format: json|table", "table")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService("roborock", "get_maps", {
      entity_id: entityId,
    });
    await handleResult(result, (data) => {
      if (options.format === "json") {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log("Maps and Rooms:");
        console.log(JSON.stringify(data, null, 2));
        console.log(
          "\nTip: Use room segment IDs with 'hac vacuum clean --rooms <id1>,<id2>'"
        );
      }
    });
  });

  // Clean specific rooms (enhanced with inline settings)
  addCommonOptions(
    vacuum
      .command("clean")
      .description("Clean specific rooms with optional settings")
      .requiredOption(
        "-r, --rooms <ids>",
        "Comma-separated room segment IDs (e.g., 16,17,18)"
      )
      .option("--repeats <n>", "Number of cleaning passes", "1")
      .option("--fan <speed>", "Set fan speed before cleaning (off|silent|balanced|turbo|max)")
      .option("--mop <mode>", "Set mop mode before cleaning (off|standard|deep|deep_plus)")
      .option("--water <level>", "Set water/mop intensity before cleaning (off|low|medium|high)")
      .addHelpText(
        "after",
        `
Clean specific rooms with optional inline settings.

Room IDs can be found using 'hac vacuum rooms'.

Options:
  --fan <speed>     Set fan/suction power before cleaning
  --mop <mode>      Set mop route/pattern before cleaning
  --water <level>   Set water intensity before cleaning
  --repeats <n>     Number of cleaning passes (default: 1)

When settings are provided, they are applied BEFORE starting the clean.
This ensures the vacuum uses your desired settings for the cleaning job.

Examples:
  $ hac vacuum clean -r 16,17                           # Clean rooms 16,17
  $ hac vacuum clean -r 16 --repeats 2                  # Clean room 16 twice
  $ hac vacuum clean -r 16,17 --fan turbo               # Turbo suction
  $ hac vacuum clean -r 16 --fan max --water off        # Vacuum only, max power
  $ hac vacuum clean -r 16 --fan off --water high       # Mop only, high water
  $ hac vacuum clean -r 16,17,18 --fan balanced --mop deep --water medium
`
      )
  ).action(
    async (
      options: VacuumOptions & {
        rooms: string;
        repeats?: string;
        fan?: string;
        mop?: string;
        water?: string;
      }
    ) => {
      const client = getClient(options);
      const entityId = getEntityId(options);
      const deviceName = getDeviceName(entityId);
      const segments = options.rooms.split(",").map((id) => parseInt(id.trim(), 10));
      const repeats = parseInt(options.repeats || "1", 10);

      if (segments.some(isNaN)) {
        console.error("Invalid room IDs. Use comma-separated numbers.");
        process.exit(1);
      }

      // Apply settings before cleaning
      const settingsApplied: string[] = [];

      if (options.fan) {
        const result = await client.callService("vacuum", "set_fan_speed", {
          entity_id: entityId,
          fan_speed: options.fan.toLowerCase(),
        });
        if (!result.ok) {
          console.error(`Failed to set fan speed: ${result.error}`);
          process.exit(1);
        }
        settingsApplied.push(`fan=${options.fan}`);
      }

      if (options.mop) {
        const selectEntity = `select.${deviceName}_mop_mode`;
        const result = await setSelectOption(client, selectEntity, options.mop.toLowerCase());
        if (!result.ok) {
          console.error(`Failed to set mop mode: ${result.error}`);
          process.exit(1);
        }
        settingsApplied.push(`mop=${options.mop}`);
      }

      if (options.water) {
        const selectEntity = `select.${deviceName}_mop_intensity`;
        const result = await setSelectOption(client, selectEntity, options.water.toLowerCase());
        if (!result.ok) {
          console.error(`Failed to set water level: ${result.error}`);
          process.exit(1);
        }
        settingsApplied.push(`water=${options.water}`);
      }

      // Start segment cleaning
      const result = await client.callService(
        "roborock",
        "vacuum_clean_segment",
        {
          entity_id: entityId,
          segments,
          repeats,
        }
      );

      await handleResult(result, () => {
        const settings = settingsApplied.length > 0
          ? ` [${settingsApplied.join(", ")}]`
          : "";
        console.log(
          `Cleaning rooms [${segments.join(", ")}] (${repeats}x)${settings}: ${entityId}`
        );
      });
    }
  );

  // Goto command
  addCommonOptions(
    vacuum
      .command("goto <x> <y>")
      .description("Send vacuum to specific coordinates (Roborock)")
      .addHelpText(
        "after",
        `
Coordinate System:
  - Dock is typically at coordinates (25500, 25500)
  - Coordinates are in Roborock internal units
  - Use 'hac vacuum position' to get current location

Examples:
  $ hac vacuum goto 25500 25500  # Go to dock area
  $ hac vacuum goto 30000 20000  # Go to specific location
`
      )
  ).action(async (x: string, y: string, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const xCoord = parseInt(x, 10);
    const yCoord = parseInt(y, 10);

    if (isNaN(xCoord) || isNaN(yCoord)) {
      console.error("Coordinates must be numbers");
      process.exit(1);
    }

    const result = await client.callService(
      "roborock",
      "set_vacuum_goto_position",
      {
        entity_id: entityId,
        x: xCoord,
        y: yCoord,
      }
    );
    await handleResult(result, () => {
      console.log(`Going to (${xCoord}, ${yCoord}): ${entityId}`);
    });
  });

  // Position command
  addCommonOptions(
    vacuum
      .command("position")
      .alias("pos")
      .description("Get current vacuum position (Roborock)")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const result = await client.callService(
      "roborock",
      "get_vacuum_current_position",
      {
        entity_id: entityId,
      }
    );
    await handleResult(result);
  });

  // Config command - show all configurable settings
  addCommonOptions(
    vacuum
      .command("config")
      .description("Show all vacuum settings and their current values")
      .option("-f, --format <format>", "Output format: json|table", "table")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);

    // Get vacuum entity for fan speed
    const vacuumResult = await client.getState(entityId);
    if (!vacuumResult.ok) {
      console.error(`Error: ${vacuumResult.error}`);
      process.exit(1);
    }

    const config: Record<string, { current: string | null; options: string[] | null }> = {};

    // Fan speed from vacuum entity
    config["fan_speed"] = {
      current: vacuumResult.data.attributes.fan_speed as string || null,
      options: vacuumResult.data.attributes.fan_speed_list as string[] || null,
    };

    // Select entities
    const selectEntities = [
      { key: "mop_mode", entity: `select.${deviceName}_mop_mode` },
      { key: "mop_intensity", entity: `select.${deviceName}_mop_intensity` },
      { key: "dust_collection_mode", entity: `select.${deviceName}_dust_collection_mode` },
    ];

    for (const { key, entity } of selectEntities) {
      const current = await getSelectValue(client, entity);
      const opts = await getSelectOptions(client, entity);
      config[key] = { current, options: opts };
    }

    if (options.format === "json") {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(`Vacuum Settings for ${entityId}:\n`);
    for (const [key, value] of Object.entries(config)) {
      const currentStr = value.current || "(not available)";
      const optsStr = value.options ? value.options.join(", ") : "(unknown)";
      console.log(`${key}:`);
      console.log(`  Current: ${currentStr}`);
      console.log(`  Options: ${optsStr}`);
      console.log();
    }
  });

  // Sensors command - get all related sensors
  addCommonOptions(
    vacuum
      .command("sensors")
      .description("Get all sensors for this vacuum")
      .option("-f, --format <format>", "Output format: json|table|short", "short")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const result = await client.getStatesMatching(deviceName);
    await handleResult(result, (states) => {
      if (states.length === 0) {
        console.log(`No sensors found for ${deviceName}`);
        return;
      }
      console.log(formatStates(states, options.format || "short"));
    });
  });

  // Battery command
  addCommonOptions(
    vacuum
      .command("battery")
      .description("Get battery level")
  ).action(async (options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const sensorEntity = `sensor.${deviceName}_battery`;
    const result = await client.getState(sensorEntity);
    await handleResult(result, (state) => {
      console.log(`Battery: ${state.state}%`);
    });
  });

  // Set command - generic select entity control
  addCommonOptions(
    vacuum
      .command("set <setting> <value>")
      .description("Set any vacuum select entity")
      .addHelpText(
        "after",
        `
Set any vacuum setting by name. Useful for model-specific options
that may not have dedicated commands.

The setting name is appended to the device name to form the entity.
For example, 'hac vacuum set mop_mode deep' targets:
  select.<device_name>_mop_mode

Examples:
  $ hac vacuum set mop_mode deep
  $ hac vacuum set mop_intensity high
  $ hac vacuum set dust_collection_mode smart
  $ hac vacuum set selected_map "Upstairs"
`
      )
  ).action(async (setting: string, value: string, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const selectEntity = `select.${deviceName}_${setting}`;

    const result = await setSelectOption(client, selectEntity, value);
    await handleResult(result, () => {
      console.log(`${setting} set to: ${value}`);
    });
  });

  // Get command - generic select entity read
  addCommonOptions(
    vacuum
      .command("get <setting>")
      .description("Get any vacuum select entity value")
      .addHelpText(
        "after",
        `
Get any vacuum setting by name.

Examples:
  $ hac vacuum get mop_mode
  $ hac vacuum get mop_intensity
  $ hac vacuum get selected_map
`
      )
  ).action(async (setting: string, options: VacuumOptions) => {
    const client = getClient(options);
    const entityId = getEntityId(options);
    const deviceName = getDeviceName(entityId);
    const selectEntity = `select.${deviceName}_${setting}`;

    const current = await getSelectValue(client, selectEntity);
    const available = await getSelectOptions(client, selectEntity);

    if (current === null) {
      console.log(`Could not read ${setting} (entity: ${selectEntity})`);
      console.log(`Try: hac state search ${setting}`);
      process.exit(1);
    }

    console.log(`${setting}: ${current}`);
    if (available) {
      console.log(`Available options: ${available.join(", ")}`);
    }
  });

  return vacuum;
}

#!/usr/bin/env node
/**
 * hac - Home Assistant CLI
 *
 * A heavily parameterized CLI for controlling Home Assistant devices
 * via the Supervisor API (add-on mode) or REST API (external mode).
 *
 * Environment Variables:
 *   SUPERVISOR_TOKEN   - Auto-injected when running as HA add-on
 *   HA_TOKEN           - Long-lived access token for external access
 *   HA_URL             - Home Assistant base URL
 *   HAC_VACUUM_ENTITY  - Default vacuum entity ID
 *
 * Usage:
 *   hac vacuum status           - Get vacuum state
 *   hac vacuum start            - Start cleaning
 *   hac state get <entity>      - Query entity state
 *   hac service call <service>  - Call HA service
 *
 * For detailed help:
 *   hac --help
 *   hac vacuum --help
 *   hac state --help
 *   hac service --help
 */

import { Command } from "commander";
import { HAClient, resolveConfig } from "./client.js";
import { createVacuumCommand } from "./commands/vacuum.js";
import { createStateCommand } from "./commands/state.js";
import { createServiceCommand } from "./commands/service.js";

const VERSION = "0.1.0";

async function main() {
  const program = new Command()
    .name("hac")
    .description(
      `Home Assistant CLI - Control HA devices from the command line

Designed to work both as a Home Assistant add-on (using SUPERVISOR_TOKEN)
and externally (using HA_TOKEN or --token).`
    )
    .version(VERSION, "-V, --version", "Display version number")
    .addHelpText(
      "after",
      `
Environment Variables:
  SUPERVISOR_TOKEN    Auto-injected token when running as HA add-on
  HA_TOKEN            Long-lived access token for external access
  HA_URL              Home Assistant URL (default depends on mode)
                      - Add-on mode: http://supervisor/core
                      - External mode: http://homeassistant.local:8123
  HAC_VACUUM_ENTITY   Default vacuum entity (default: vacuum.roborock_s7)

Authentication:
  When running as a Home Assistant add-on, authentication is automatic
  via the SUPERVISOR_TOKEN environment variable.

  For external access, create a long-lived access token:
  1. Go to HA → Profile → Long-Lived Access Tokens
  2. Create token and export: export HA_TOKEN="your-token"
  3. Set URL if needed: export HA_URL="http://192.168.1.100:8123"

Examples:
  # Vacuum commands
  hac vacuum status                    # Get vacuum state
  hac vacuum start                     # Start cleaning
  hac vacuum dock                      # Return to dock
  hac vacuum rooms                     # List rooms (Roborock)
  hac vacuum clean --rooms 16,17       # Clean specific rooms
  hac vacuum fan turbo                 # Set fan speed
  hac vacuum goto 25500 25500          # Go to coordinates

  # State queries
  hac state get sensor.temperature     # Get single entity
  hac state list --domain light        # List lights
  hac state search roborock            # Search entities
  hac state domains                    # List all domains

  # Service calls
  hac service call light.turn_on --entity light.kitchen
  hac service call script.turn_on --entity script.goodnight
  hac service list                     # List all service domains
  hac service info light.turn_on       # Service documentation

  # Connectivity check
  hac ping                             # Test connection
  hac config                           # Show HA configuration

More Help:
  hac vacuum --help                    # Vacuum command details
  hac state --help                     # State command details
  hac service --help                   # Service command details
`
    );

  // Global options
  program
    .option("-u, --url <url>", "Home Assistant API URL")
    .option("-t, --token <token>", "Authentication token")
    .option("--timeout <ms>", "Request timeout in ms", "30000")
    .option("-v, --verbose", "Enable verbose logging");

  // Add subcommands
  program.addCommand(createVacuumCommand());
  program.addCommand(createStateCommand());
  program.addCommand(createServiceCommand());

  // Ping command - test connectivity
  program
    .command("ping")
    .description("Test connection to Home Assistant")
    .action(async () => {
      const opts = program.opts();
      const client = new HAClient(resolveConfig(opts));
      const result = await client.ping();

      if (!result.ok) {
        console.error(`Connection failed: ${result.error}`);
        process.exit(1);
      }

      console.log("Connected to Home Assistant");
      console.log(`Message: ${result.data.message}`);
    });

  // Config command - show HA configuration
  program
    .command("config")
    .description("Show Home Assistant configuration")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      const opts = program.opts();
      const client = new HAClient(resolveConfig(opts));
      const result = await client.getConfig();

      if (!result.ok) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }

      const config = result.data;
      console.log("Home Assistant Configuration:");
      console.log(`  Location:     ${config.location_name}`);
      console.log(`  Version:      ${config.version}`);
      console.log(`  Timezone:     ${config.time_zone}`);
      console.log(`  Unit System:  ${config.unit_system}`);
      console.log(`  Internal URL: ${config.internal_url}`);
      console.log(`  External URL: ${config.external_url || "(not set)"}`);
    });

  // Event command - fire an event
  program
    .command("event <event_type>")
    .description("Fire a Home Assistant event")
    .option("-d, --data <json>", "Event data as JSON string")
    .action(async (eventType: string, options: { data?: string }) => {
      const opts = program.opts();
      const client = new HAClient(resolveConfig(opts));

      let eventData: Record<string, unknown> | undefined;
      if (options.data) {
        try {
          eventData = JSON.parse(options.data);
        } catch (e) {
          console.error(`Invalid JSON in --data: ${(e as Error).message}`);
          process.exit(1);
        }
      }

      const result = await client.fireEvent(eventType, eventData);

      if (!result.ok) {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }

      console.log(`Event fired: ${eventType}`);
    });

  // Parse and execute
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});

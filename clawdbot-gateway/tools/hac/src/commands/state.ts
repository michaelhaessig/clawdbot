import { Command } from "commander";
import {
  HAClient,
  resolveConfig,
  formatState,
  formatStates,
} from "../client.js";

type StateOptions = {
  url?: string;
  token?: string;
  timeout?: number;
  verbose?: boolean;
  format?: "json" | "table" | "short";
  domain?: string;
  filter?: string;
};

function getClient(options: StateOptions): HAClient {
  return new HAClient(resolveConfig(options));
}

export function createStateCommand(): Command {
  const state = new Command("state")
    .description("Query Home Assistant entity states")
    .addHelpText(
      "after",
      `
Environment Variables:
  HA_URL              Home Assistant URL (default: http://supervisor/core)
  HA_TOKEN            Long-lived access token (for external access)
  SUPERVISOR_TOKEN    Auto-injected when running as HA add-on

Examples:
  $ hac state get sensor.temperature
  $ hac state list
  $ hac state list --domain sensor
  $ hac state list --filter "temperature|humidity"
  $ hac state search roborock
`
    );

  // Shared options
  const addCommonOptions = (cmd: Command): Command =>
    cmd
      .option("-u, --url <url>", "Home Assistant API URL")
      .option("-t, --token <token>", "Authentication token")
      .option("--timeout <ms>", "Request timeout in ms", "30000")
      .option("-v, --verbose", "Enable verbose logging");

  // Get single entity state
  addCommonOptions(
    state
      .command("get <entity_id>")
      .description("Get state of a specific entity")
      .option("-f, --format <format>", "Output format: json|table|short", "table")
  ).action(async (entityId: string, options: StateOptions) => {
    const client = getClient(options);
    const result = await client.getState(entityId);
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }
    console.log(formatState(result.data, options.format || "table"));
  });

  // List all entities
  addCommonOptions(
    state
      .command("list")
      .description("List all entity states")
      .option("-f, --format <format>", "Output format: json|table|short", "short")
      .option("-d, --domain <domain>", "Filter by domain (e.g., sensor, light, switch)")
      .option("--filter <pattern>", "Filter by regex pattern on entity_id or friendly_name")
      .option("--limit <n>", "Limit number of results")
  ).action(async (options: StateOptions & { limit?: string }) => {
    const client = getClient(options);
    const result = await client.getStates();
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    let states = result.data;

    // Filter by domain
    if (options.domain) {
      const domainPrefix = `${options.domain}.`;
      states = states.filter((s) => s.entity_id.startsWith(domainPrefix));
    }

    // Filter by pattern
    if (options.filter) {
      const regex = new RegExp(options.filter, "i");
      states = states.filter(
        (s) =>
          regex.test(s.entity_id) ||
          regex.test((s.attributes.friendly_name as string) || "")
      );
    }

    // Sort by entity_id
    states.sort((a, b) => a.entity_id.localeCompare(b.entity_id));

    // Limit
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (!isNaN(limit) && limit > 0) {
        states = states.slice(0, limit);
      }
    }

    if (states.length === 0) {
      console.log("No entities found matching criteria");
      return;
    }

    console.log(formatStates(states, options.format || "short"));
    console.log(`\nTotal: ${states.length} entities`);
  });

  // Search entities
  addCommonOptions(
    state
      .command("search <pattern>")
      .description("Search entities by name or ID pattern")
      .option("-f, --format <format>", "Output format: json|table|short", "short")
  ).action(async (pattern: string, options: StateOptions) => {
    const client = getClient(options);
    const result = await client.getStatesMatching(pattern);
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    if (result.data.length === 0) {
      console.log(`No entities found matching: ${pattern}`);
      return;
    }

    console.log(formatStates(result.data, options.format || "short"));
    console.log(`\nFound: ${result.data.length} entities`);
  });

  // Domains command - list unique domains
  addCommonOptions(
    state
      .command("domains")
      .description("List all entity domains with counts")
  ).action(async (options: StateOptions) => {
    const client = getClient(options);
    const result = await client.getStates();
    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    const domainCounts = new Map<string, number>();
    for (const s of result.data) {
      const domain = s.entity_id.split(".")[0];
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }

    const sorted = Array.from(domainCounts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );

    console.log("Domain           Count");
    console.log("-".repeat(30));
    for (const [domain, count] of sorted) {
      console.log(`${domain.padEnd(16)} ${count}`);
    }
    console.log("-".repeat(30));
    console.log(`Total: ${result.data.length} entities`);
  });

  // Watch command (poll-based)
  addCommonOptions(
    state
      .command("watch <entity_id>")
      .description("Watch an entity for state changes (polls every N seconds)")
      .option("-i, --interval <seconds>", "Poll interval in seconds", "5")
      .option("-f, --format <format>", "Output format: json|short", "short")
  ).action(
    async (entityId: string, options: StateOptions & { interval: string }) => {
      const client = getClient(options);
      const intervalMs = parseInt(options.interval, 10) * 1000;

      let lastState: string | undefined;
      console.log(`Watching ${entityId} (Ctrl+C to stop)...`);

      const poll = async () => {
        const result = await client.getState(entityId);
        if (!result.ok) {
          console.error(`Error: ${result.error}`);
          return;
        }

        const currentState = result.data.state;
        if (currentState !== lastState) {
          const timestamp = new Date().toISOString();
          if (options.format === "json") {
            console.log(JSON.stringify({ timestamp, ...result.data }));
          } else {
            console.log(`[${timestamp}] ${entityId}: ${currentState}`);
          }
          lastState = currentState;
        }
      };

      // Initial poll
      await poll();

      // Set up interval
      const handle = setInterval(poll, intervalMs);

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        clearInterval(handle);
        console.log("\nStopped watching");
        process.exit(0);
      });

      // Keep process alive
      await new Promise(() => {});
    }
  );

  return state;
}

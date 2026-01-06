import { Command } from "commander";
import { HAClient, resolveConfig } from "../client.js";

type ServiceOptions = {
  url?: string;
  token?: string;
  timeout?: number;
  verbose?: boolean;
  data?: string;
  entity?: string;
};

function getClient(options: ServiceOptions): HAClient {
  return new HAClient(resolveConfig(options));
}

export function createServiceCommand(): Command {
  const service = new Command("service")
    .description("Call Home Assistant services")
    .addHelpText(
      "after",
      `
Environment Variables:
  HA_URL              Home Assistant URL (default: http://supervisor/core)
  HA_TOKEN            Long-lived access token (for external access)
  SUPERVISOR_TOKEN    Auto-injected when running as HA add-on

Service Call Format:
  hac service call <domain>.<service> [options]

Examples:
  $ hac service call light.turn_on --entity light.living_room
  $ hac service call light.turn_on --data '{"entity_id":"light.living_room","brightness":128}'
  $ hac service call script.turn_on --entity script.goodnight
  $ hac service call notify.mobile_app --data '{"message":"Hello!","title":"Test"}'
  $ hac service list
  $ hac service list light
`
    );

  // Shared options
  const addCommonOptions = (cmd: Command): Command =>
    cmd
      .option("-u, --url <url>", "Home Assistant API URL")
      .option("-t, --token <token>", "Authentication token")
      .option("--timeout <ms>", "Request timeout in ms", "30000")
      .option("-v, --verbose", "Enable verbose logging");

  // Call a service
  addCommonOptions(
    service
      .command("call <domain_service>")
      .description("Call a Home Assistant service")
      .option("-e, --entity <entity_id>", "Entity ID to target")
      .option("-d, --data <json>", "Service data as JSON string")
      .addHelpText(
        "after",
        `
Arguments:
  domain_service    Service in format "domain.service" (e.g., light.turn_on)

Options:
  -e, --entity      Shorthand for {"entity_id": "<value>"}
  -d, --data        Full service data as JSON (overrides --entity)

Examples:
  $ hac service call light.turn_on --entity light.kitchen
  $ hac service call light.turn_on --data '{"entity_id":"light.kitchen","brightness":200}'
  $ hac service call climate.set_temperature --data '{"entity_id":"climate.thermostat","temperature":22}'
  $ hac service call tts.google_say --data '{"entity_id":"media_player.speaker","message":"Hello"}'
`
      )
  ).action(async (domainService: string, options: ServiceOptions) => {
    const client = getClient(options);

    // Parse domain.service
    const parts = domainService.split(".");
    if (parts.length !== 2) {
      console.error(
        `Invalid service format: ${domainService}. Expected "domain.service"`
      );
      process.exit(1);
    }
    const [domain, serviceName] = parts;

    // Build service data
    let data: Record<string, unknown> = {};

    if (options.data) {
      try {
        data = JSON.parse(options.data);
      } catch (e) {
        console.error(`Invalid JSON in --data: ${(e as Error).message}`);
        process.exit(1);
      }
    } else if (options.entity) {
      data = { entity_id: options.entity };
    }

    const result = await client.callService(domain, serviceName, data);

    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log(`Service called: ${domain}.${serviceName}`);
    if (result.data && Object.keys(result.data as object).length > 0) {
      console.log("Response:");
      console.log(JSON.stringify(result.data, null, 2));
    }
  });

  // List services
  addCommonOptions(
    service
      .command("list [domain]")
      .description("List available services (optionally filtered by domain)")
      .option("--json", "Output as JSON")
  ).action(async (domain: string | undefined, options: ServiceOptions & { json?: boolean }) => {
    const client = getClient(options);
    const result = await client.getServices();

    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    const services = result.data as Record<
      string,
      Record<string, { name?: string; description?: string; fields?: unknown }>
    >;

    if (options.json) {
      if (domain) {
        console.log(JSON.stringify(services[domain] || {}, null, 2));
      } else {
        console.log(JSON.stringify(services, null, 2));
      }
      return;
    }

    if (domain) {
      // Show services for specific domain
      const domainServices = services[domain];
      if (!domainServices) {
        console.log(`No services found for domain: ${domain}`);
        return;
      }

      console.log(`Services for domain "${domain}":\n`);
      for (const [serviceName, info] of Object.entries(domainServices)) {
        console.log(`  ${domain}.${serviceName}`);
        if (info.description) {
          console.log(`    ${info.description}`);
        }
      }
    } else {
      // Show all domains with service counts
      console.log("Available service domains:\n");
      const domains = Object.keys(services).sort();
      for (const d of domains) {
        const count = Object.keys(services[d]).length;
        console.log(`  ${d.padEnd(24)} (${count} services)`);
      }
      console.log(`\nTotal: ${domains.length} domains`);
      console.log('\nUse "hac service list <domain>" to see services for a domain');
    }
  });

  // Info about a specific service
  addCommonOptions(
    service
      .command("info <domain_service>")
      .description("Get detailed info about a service")
  ).action(async (domainService: string, options: ServiceOptions) => {
    const client = getClient(options);

    // Parse domain.service
    const parts = domainService.split(".");
    if (parts.length !== 2) {
      console.error(
        `Invalid service format: ${domainService}. Expected "domain.service"`
      );
      process.exit(1);
    }
    const [domain, serviceName] = parts;

    const result = await client.getServices();

    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    const services = result.data as Record<
      string,
      Record<
        string,
        {
          name?: string;
          description?: string;
          fields?: Record<
            string,
            {
              name?: string;
              description?: string;
              required?: boolean;
              example?: unknown;
              selector?: unknown;
            }
          >;
          target?: unknown;
        }
      >
    >;

    const domainServices = services[domain];
    if (!domainServices) {
      console.error(`Domain not found: ${domain}`);
      process.exit(1);
    }

    const serviceInfo = domainServices[serviceName];
    if (!serviceInfo) {
      console.error(`Service not found: ${domainService}`);
      console.log(`\nAvailable services in ${domain}:`);
      for (const s of Object.keys(domainServices)) {
        console.log(`  ${domain}.${s}`);
      }
      process.exit(1);
    }

    console.log(`Service: ${domain}.${serviceName}`);
    if (serviceInfo.name) {
      console.log(`Name: ${serviceInfo.name}`);
    }
    if (serviceInfo.description) {
      console.log(`Description: ${serviceInfo.description}`);
    }

    if (serviceInfo.fields && Object.keys(serviceInfo.fields).length > 0) {
      console.log("\nFields:");
      for (const [fieldName, fieldInfo] of Object.entries(serviceInfo.fields)) {
        const required = fieldInfo.required ? " (required)" : "";
        console.log(`  ${fieldName}${required}`);
        if (fieldInfo.description) {
          console.log(`    ${fieldInfo.description}`);
        }
        if (fieldInfo.example !== undefined) {
          console.log(`    Example: ${JSON.stringify(fieldInfo.example)}`);
        }
      }
    }

    if (serviceInfo.target) {
      console.log("\nTarget:");
      console.log(JSON.stringify(serviceInfo.target, null, 2));
    }
  });

  return service;
}

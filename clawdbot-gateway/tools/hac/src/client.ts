/**
 * Home Assistant API Client
 *
 * Supports multiple connection modes:
 * 1. Supervisor API (when running as HA add-on) - uses SUPERVISOR_TOKEN
 * 2. Direct API (external access) - uses long-lived access token
 *
 * Environment variables:
 * - SUPERVISOR_TOKEN: Auto-injected when running as HA add-on
 * - HA_TOKEN: Long-lived access token for external access
 * - HA_URL: Home Assistant base URL (default: http://supervisor/core for add-on mode)
 */

export type HAClientConfig = {
  /** Base URL for Home Assistant API */
  url: string;
  /** Authentication token (SUPERVISOR_TOKEN or long-lived access token) */
  token: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Enable verbose logging */
  verbose: boolean;
};

export type HAState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
};

export type HAServiceResponse = {
  success: boolean;
  data?: unknown;
  error?: string;
};

export type HAClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/**
 * Resolve configuration from environment and CLI options
 */
export function resolveConfig(options: {
  url?: string;
  token?: string;
  timeout?: number;
  verbose?: boolean;
}): HAClientConfig {
  // Determine if we're running as an HA add-on
  const supervisorToken = process.env.SUPERVISOR_TOKEN;
  const isSupervisorMode = !!supervisorToken && !options.url && !options.token;

  // Resolve URL
  let url = options.url;
  if (!url) {
    url = process.env.HA_URL;
  }
  if (!url) {
    // Default based on mode
    url = isSupervisorMode
      ? "http://supervisor/core"
      : "http://homeassistant.local:8123";
  }
  // Ensure no trailing slash
  url = url.replace(/\/+$/, "");

  // Resolve token
  let token = options.token;
  if (!token) {
    token = supervisorToken || process.env.HA_TOKEN || "";
  }

  return {
    url,
    token,
    timeout: options.timeout ?? 30000,
    verbose: options.verbose ?? false,
  };
}

/**
 * Home Assistant API Client
 */
export class HAClient {
  constructor(private config: HAClientConfig) {}

  private log(message: string, data?: unknown): void {
    if (this.config.verbose) {
      console.error(`[hac] ${message}`, data ?? "");
    }
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<HAClientResult<T>> {
    const url = `${this.config.url}/api${path}`;
    this.log(`${method} ${url}`, body);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.token) {
      headers["Authorization"] = `Bearer ${this.config.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
          ok: false,
          error: `HTTP ${response.status}: ${response.statusText}${text ? ` - ${text}` : ""}`,
          status: response.status,
        };
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = (await response.json()) as T;
        this.log("Response:", data);
        return { ok: true, data };
      }

      // Some endpoints return empty or non-JSON responses
      return { ok: true, data: {} as T };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          return { ok: false, error: `Request timeout after ${this.config.timeout}ms` };
        }
        return { ok: false, error: error.message };
      }
      return { ok: false, error: String(error) };
    }
  }

  /**
   * Get all entity states
   */
  async getStates(): Promise<HAClientResult<HAState[]>> {
    return this.request<HAState[]>("GET", "/states");
  }

  /**
   * Get a specific entity state
   */
  async getState(entityId: string): Promise<HAClientResult<HAState>> {
    return this.request<HAState>("GET", `/states/${entityId}`);
  }

  /**
   * Get states matching a pattern (client-side filter)
   */
  async getStatesMatching(
    pattern: string
  ): Promise<HAClientResult<HAState[]>> {
    const result = await this.getStates();
    if (!result.ok) return result;

    const regex = new RegExp(pattern, "i");
    const filtered = result.data.filter(
      (state) =>
        regex.test(state.entity_id) ||
        regex.test(state.attributes.friendly_name as string || "")
    );

    return { ok: true, data: filtered };
  }

  /**
   * Call a Home Assistant service
   * @param returnResponse - If true, adds ?return_response for services that return data
   */
  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    returnResponse?: boolean
  ): Promise<HAClientResult<unknown>> {
    const path = returnResponse
      ? `/services/${domain}/${service}?return_response`
      : `/services/${domain}/${service}`;
    return this.request<unknown>("POST", path, data);
  }

  /**
   * Check API connectivity
   */
  async ping(): Promise<HAClientResult<{ message: string }>> {
    return this.request<{ message: string }>("GET", "/");
  }

  /**
   * Get HA configuration
   */
  async getConfig(): Promise<HAClientResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>("GET", "/config");
  }

  /**
   * Get registered services
   */
  async getServices(): Promise<HAClientResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>("GET", "/services");
  }

  /**
   * Fire an event
   */
  async fireEvent(
    eventType: string,
    eventData?: Record<string, unknown>
  ): Promise<HAClientResult<unknown>> {
    return this.request<unknown>("POST", `/events/${eventType}`, eventData);
  }
}

/**
 * Format a state for display
 */
export function formatState(state: HAState, format: "json" | "table" | "short"): string {
  switch (format) {
    case "json":
      return JSON.stringify(state, null, 2);
    case "short":
      return `${state.entity_id}: ${state.state}`;
    case "table":
    default: {
      const lines = [
        `Entity:     ${state.entity_id}`,
        `State:      ${state.state}`,
        `Updated:    ${state.last_updated}`,
      ];
      const friendlyName = state.attributes.friendly_name;
      if (friendlyName) {
        lines.splice(1, 0, `Name:       ${friendlyName}`);
      }
      // Add key attributes
      const skipKeys = new Set(["friendly_name", "icon", "supported_features"]);
      for (const [key, value] of Object.entries(state.attributes)) {
        if (skipKeys.has(key)) continue;
        if (value === null || value === undefined) continue;
        const formatted = typeof value === "object" ? JSON.stringify(value) : String(value);
        if (formatted.length < 60) {
          lines.push(`  ${key}: ${formatted}`);
        }
      }
      return lines.join("\n");
    }
  }
}

/**
 * Format multiple states for display
 */
export function formatStates(
  states: HAState[],
  format: "json" | "table" | "short"
): string {
  if (format === "json") {
    return JSON.stringify(states, null, 2);
  }
  return states.map((s) => formatState(s, format)).join("\n\n");
}

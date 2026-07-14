/**
 * MCP client — calls the live beach-safety-mcp server via the mcporter runtime.
 *
 * Trade-offs documented in MEMORY.md / nightly build chat:
 *   - Pure-JS lib/beach-api.ts: faster (no spawn), simpler, no daemon required,
 *     same Open-Meteo + NOAA sources, ~2s per request.
 *   - MCP via mcporter runtime: exact same data shape as the Python server,
 *     single source of truth, but adds mcporter dep + daemon complexity.
 *
 * This client is wired but OFF by default. Set BEACH_SAFETY_MCP=1 to route requests
 * through the MCP. The route handler does the toggle.
 *
 * When ON:
 *   - `mcporter daemon start` must be running (beach-safety needs lifecycle.mode=keep-alive)
 *   - First request: ~2s (cold connection); subsequent: ~1.5s (warm via daemon)
 *
 * The MCP server source is at /Users/evanfoglia/.openclaw/workspace/projects/beach-safety-mcp
 */

import type { BeachData } from "./beach-api";

type CallOnceFn = (params: {
  server: string;
  toolName: string;
  args?: Record<string, unknown>;
  configPath?: string;
}) => Promise<unknown>;

let cachedCallOnce: CallOnceFn | null = null;

async function getCallOnce(): Promise<CallOnceFn> {
  if (cachedCallOnce) return cachedCallOnce;
  // Dynamic import — mcporter is ESM-only
  const mod = await import("mcporter");
  cachedCallOnce = (mod as unknown as { callOnce: CallOnceFn }).callOnce;
  return cachedCallOnce;
}

/**
 * Whether to route via MCP. Toggle via env var so we can flip without code change.
 */
export function mcpEnabled(): boolean {
  return process.env.BEACH_SAFETY_MCP === "1" || process.env.BEACH_SAFETY_MCP === "true";
}

/**
 * Get beach report from the MCP via the mcporter runtime. The runtime auto-routes
 * through the keep-alive daemon when lifecycle.mode=keep-alive is set on the server.
 */
export async function getBeachReportViaMcp(
  beachName: string,
  latitude?: number,
  longitude?: number
): Promise<BeachData> {
  const args: Record<string, unknown> = { beach_name: beachName };
  if (latitude != null) args.latitude = latitude;
  if (longitude != null) args.longitude = longitude;

  const callOnce = await getCallOnce();

  let raw: unknown;
  // Prefer the JSON variant — it's structured, parseable, easier to normalize.
  // Fall back to the formatted text report if JSON isn't available.
  try {
    raw = await callOnce({
      server: "beach-safety",
      toolName: "get_beach_json",
      args,
    });
  } catch {
    raw = await callOnce({
      server: "beach-safety",
      toolName: "get_beach_report",
      args,
    });
  }

  return normalizeMcpReport(raw, beachName);
}

/**
 * Extract the text content from an MCP tool-call response. The Python MCP server wraps
 * results as `{ content: [{ type: "text", text: "..." }] }`.
 */
function extractMcpText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const content = obj.content as Array<{ type: string; text: string }> | undefined;
    if (Array.isArray(content) && content[0]?.text) {
      return content[0].text;
    }
    if (typeof obj.text === "string") return obj.text;
  }
  return JSON.stringify(raw);
}

function parseMcpText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { report: text };
  }
}

/**
 * Convert MCP output into our BeachData shape.
 */
function normalizeMcpReport(raw: unknown, fallbackName: string): BeachData {
  // If raw is the MCP envelope ({ content: [...] }), unwrap it first
  let payload = raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).content)) {
    payload = parseMcpText(extractMcpText(raw));
  }

  // If parseMcpText gave us a string in `report`, the MCP returned a formatted text report.
  // Surface it via weather_forecast so the UI can show something useful.
  if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).report === "string") {
    return emptyBeach(fallbackName, "MCP returned text report, not JSON") as BeachData & { weather_forecast: string };
  }

  if (!payload || typeof payload !== "object") {
    return emptyBeach(fallbackName, "MCP returned empty response");
  }

  const obj = payload as Record<string, unknown>;
  const inner = obj.report && typeof obj.report === "object" ? (obj.report as Record<string, unknown>) : obj;

  return {
    beach_name: (inner.beach_name as string) ?? fallbackName,
    latitude: (inner.latitude as number) ?? 0,
    longitude: (inner.longitude as number) ?? 0,
    timestamp_utc: (inner.timestamp_utc as string) ?? new Date().toISOString(),
    rip_current_risk: (inner.rip_current_risk as string) ?? "Unknown",
    surf_height: (inner.surf_height as string) ?? "Unknown",
    water_quality: (inner.water_quality as string) ?? "Unknown",
    safety_score: (inner.safety_score as number) ?? 0,
    safety_summary: (inner.safety_summary as string) ?? "",
    recommendations: (inner.recommendations as string[]) ?? [],
    uv_index: (inner.uv_index as number | null) ?? null,
    uv_risk: (inner.uv_risk as string) ?? "Unknown",
    air_temperature_f: (inner.air_temperature_f as number | null) ?? null,
    water_temperature_f: (inner.water_temperature_f as number | null) ?? null,
    wave: (inner.wave as BeachData["wave"]) ?? defaultWave(),
    swell: (inner.swell as BeachData["swell"]) ?? defaultSwell(),
    wind: (inner.wind as BeachData["wind"]) ?? defaultWind(),
    ocean: (inner.ocean as BeachData["ocean"]) ?? defaultOcean(),
    sun: (inner.sun as BeachData["sun"]) ?? { sunrise: null, sunset: null },
    weather_forecast: (inner.weather_forecast as string | null) ?? null,
  };
}

function emptyBeach(name: string, msg: string): BeachData {
  return {
    error: msg,
    beach_name: name,
    latitude: 0,
    longitude: 0,
    timestamp_utc: "",
    rip_current_risk: "Unknown",
    surf_height: "Unknown",
    water_quality: "Unknown",
    safety_score: 0,
    safety_summary: "",
    recommendations: [],
    uv_index: null,
    uv_risk: "Unknown",
    air_temperature_f: null,
    water_temperature_f: null,
    wave: defaultWave(),
    swell: defaultSwell(),
    wind: defaultWind(),
    ocean: defaultOcean(),
    sun: { sunrise: null, sunset: null },
    weather_forecast: null,
  };
}

function defaultWave(): BeachData["wave"] {
  return { height_m: null, height_ft: 0, period_sec: null, direction_deg: null, direction_cardinal: "N/A" };
}
function defaultSwell(): BeachData["swell"] {
  return { height_m: null, height_ft: 0, period_sec: null, direction_deg: null, direction_cardinal: "N/A" };
}
function defaultWind(): BeachData["wind"] {
  return { speed_mph: null, direction_deg: null, direction_cardinal: "N/A", speed_text: null };
}
function defaultOcean(): BeachData["ocean"] {
  return { current_speed_knots: null, current_direction_deg: null, tide_status: null };
}

/**
 * Health check — does the MCP daemon respond? Cached for 30s.
 */
let mcpHealthCache: { up: boolean; checkedAt: number } | null = null;
export async function isMcpReachable(): Promise<boolean> {
  if (mcpHealthCache && Date.now() - mcpHealthCache.checkedAt < 30_000) {
    return mcpHealthCache.up;
  }
  try {
    const callOnce = await getCallOnce();
    await callOnce({
      server: "beach-safety",
      toolName: "get_beach_report",
      args: { beach_name: "__healthcheck__" },
    });
    mcpHealthCache = { up: true, checkedAt: Date.now() };
    return true;
  } catch {
    mcpHealthCache = { up: false, checkedAt: Date.now() };
    return false;
  }
}

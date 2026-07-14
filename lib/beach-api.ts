/**
 * Beach Safety API — pure JavaScript, no Python/MCP dependencies.
 * Uses free public APIs: Nominatim (geocoding), Open-Meteo Marine & Weather.
 */

import { geocodeCache } from "./response-cache";

export interface BeachData {
  beach_name: string;
  latitude: number;
  longitude: number;
  timezone: string; // IANA timezone, e.g. "America/New_York"
  timestamp_utc: string;
  rip_current_risk: string;
  surf_height: string;
  water_quality: string;
  safety_score: number;
  safety_summary: string;
  surf_rating: SurfRating;
  recommendations: string[];
  uv_index: number | null;
  uv_risk: string;
  air_temperature_f: number | null;
  water_temperature_f: number | null;
  wave: {
    height_m: number | null;
    height_ft: number;
    period_sec: number | null;
    direction_deg: number | null;
    direction_cardinal: string;
  };
  swell: {
    height_m: number | null;
    height_ft: number;
    period_sec: number | null;
    direction_deg: number | null;
    direction_cardinal: string;
  };
  wind: {
    speed_mph: number | null;
    direction_deg: number | null;
    direction_cardinal: string;
    speed_text: string | null;
  };
  ocean: {
    current_speed_knots: number | null;
    current_direction_deg: number | null;
    tide_status: string | null;
  };
  sun: {
    sunrise: string | null;
    sunset: string | null;
  };
  weather_forecast: string | null;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastDay[];
  tide: TideData;
  error?: string;
}

export interface HourlyForecastPoint {
  time: string;            // ISO timestamp (local TZ)
  hour: number;            // 0-23 local
  waveHeightFt: number;
  wavePeriodSec: number | null;
  waveDirectionDeg: number | null;
  waveDirectionCardinal: string;
  swellHeightFt: number;
  swellPeriodSec: number | null;
  swellDirectionDeg: number | null;
  swellDirectionCardinal: string;
  windSpeedMph: number;
  windDirectionDeg: number;
  windDirectionCardinal: string;
  uvIndex: number;
  airTempF: number;
  cloudCoverPct: number;
  surfRating: SurfRating;
}

export interface DailyForecastDay {
  date: string;            // YYYY-MM-DD
  dayName: string;         // "TUE"
  dayDate: string;         // "JUL 14"
  waveMaxFt: number;
  wavePeriodMaxSec: number | null;
  uvMax: number;
  tempMaxF: number;
  tempMinF: number;
  rainProbPct: number;
  bestRating: SurfRating;  // best hourly rating for the day
  bestHour: number | null;
  bestWindow: { startHour: number; endHour: number } | null; // longest FAIR+ contiguous run
  sunrise: string | null;
  sunset: string | null;
}

function emptyBeachData(beachName: string, errorMsg = "No data"): BeachData {
  return {
    error: errorMsg,
    beach_name: beachName,
    latitude: 0,
    longitude: 0,
    timezone: "UTC",
    timestamp_utc: "",
    rip_current_risk: "Unknown",
    surf_height: "Unknown",
    water_quality: "Unknown",
    safety_score: 0,
    safety_summary: "",
    surf_rating: { score: 0, label: "FLAT", tone: "caution", summary: "Awaiting data", reason: "—" },
    recommendations: [],
    uv_index: null,
    uv_risk: "Unknown",
    air_temperature_f: null,
    water_temperature_f: null,
    wave: {
      height_m: null,
      height_ft: 0,
      period_sec: null,
      direction_deg: null,
      direction_cardinal: "N/A",
    },
    swell: {
      height_m: null,
      height_ft: 0,
      period_sec: null,
      direction_deg: null,
      direction_cardinal: "N/A",
    },
    wind: {
      speed_mph: null,
      direction_deg: null,
      direction_cardinal: "N/A",
      speed_text: null,
    },
    ocean: {
      current_speed_knots: null,
      current_direction_deg: null,
      tide_status: null,
    },
    sun: { sunrise: null, sunset: null },
    weather_forecast: null,
    hourly: [],
    daily: [],
    tide: { available: false },
  };
}

function msToMph(ms: number): number {
  return ms * 2.237;
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

function degToCardinal(deg: number | null): string {
  if (deg == null) return "N/A";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const i = Math.round(deg / 22.5) % 16;
  return dirs[i];
}

function computeRipRisk(waveHeightM: number, windSpeedMph: number): string {
  // High rip risk: big waves + strong offshore/lateral wind
  if (waveHeightM > 1.5 && windSpeedMph > 20) return "High";
  if (waveHeightM > 1.0 || windSpeedMph > 15) return "Moderate";
  return "Low";
}

function computeSafetyScore(ripRisk: string, waveHeightM: number, windSpeedMph: number): number {
  let score = 10;
  if (ripRisk === "High") score -= 4;
  else if (ripRisk === "Moderate") score -= 2;
  if (waveHeightM > 2.0) score -= 2;
  else if (waveHeightM > 1.5) score -= 1;
  if (windSpeedMph > 25) score -= 2;
  else if (windSpeedMph > 15) score -= 1;
  return Math.max(1, score);
}

export interface SurfRating {
  score: number;        // 1-10
  label: SurfLabel;     // FLAT / SMALL / FAIR / GOOD / EPIC
  tone: "good" | "fair" | "caution" | "danger";
  summary: string;
  reason: string;       // "windswell 4s", "groundswell 12s", "mixed 8s", "offshore", "blown out"
}
export type SurfLabel = "FLAT" | "SMALL" | "FAIR" | "GOOD" | "EPIC";

/**
 * Compute surf QUALITY rating (different from swimmer SAFETY).
 *
 * Inputs:
 *   waveHeightFt — significant wave height in feet (face height)
 *   wavePeriodSec — dominant wave period in seconds
 *   windDirDeg — wind FROM direction (meteorological convention)
 *   swellDirDeg — swell FROM direction
 *   windSpeedMph — wind speed
 *
 * Heuristic (generic, no per-break knowledge):
 *   1. Base score from wave height bands (1 ft = flat, 8+ ft = overhead+)
 *   2. Period modifier — long-period groundswell (12s+) is far more powerful
 *      and cleaner than short-period windswell (<7s)
 *   3. Wind direction vs swell — offshore = clean face, onshore = blown out
 *   4. Wind speed — high wind kills quality even when offshore
 *
 * Tuned to NOT show EPIC for tiny windswell. EPIC should mean: long-period
 * groundswell with offshore/light wind, which is what surfers actually chase.
 */
function computeSurfRating(
  waveHeightFt: number,
  wavePeriodSec: number | null,
  windDirDeg: number | null,
  swellDirDeg: number | null,
  windSpeedMph: number | null,
): SurfRating {
  const h = Number.isFinite(waveHeightFt) ? waveHeightFt : 0;
  const p = Number.isFinite(wavePeriodSec) ? (wavePeriodSec as number) : 0;
  const ws = Number.isFinite(windSpeedMph) ? (windSpeedMph as number) : 0;

  // Build the reason string up-front so every code path returns one.
  // Groundswell = long-period, organized. Windswell = short-period, choppy.
  let reason = "—";
  if (h < 1.0) {
    reason = "no swell";
  } else if (p > 0 && p < 7) {
    reason = `windswell ${p.toFixed(0)}s`;
  } else if (p >= 12) {
    reason = `groundswell ${p.toFixed(0)}s`;
  } else if (p >= 9) {
    reason = `mid-period ${p.toFixed(0)}s`;
  } else if (p > 0) {
    reason = `${p.toFixed(0)}s swell`;
  } else {
    reason = `${h.toFixed(0)}ft`;
  }
  // Append wind modifier when relevant
  if (h >= 1.0 && windDirDeg != null && swellDirDeg != null && ws > 0) {
    const diff = ((windDirDeg - swellDirDeg + 540) % 360) - 180;
    const absDiff = Math.abs(diff);
    if (ws > 20 && absDiff < 45) {
      reason += " · blown out";
    } else if (absDiff > 135 && ws < 12) {
      reason += " · offshore";
    } else if (absDiff < 45) {
      reason += " · onshore";
    }
  } else if (h >= 1.0 && ws > 25) {
    reason += " · gusty";
  }

  // FLAT: nothing to ride.
  if (h < 1.0) {
    return { score: 1, label: "FLAT", tone: "caution", summary: "Too small to surf", reason };
  }

  // Base score by wave height (face height bands).
  let base: number;
  if (h >= 8) base = 9;        // double-overhead+
  else if (h >= 6) base = 8;   // overhead+
  else if (h >= 4) base = 7;   // head-high
  else if (h >= 3) base = 5;   // chest-high
  else if (h >= 2) base = 4;   // waist-high
  else base = 3;               // 1–2 ft knee/thigh-high

  // Period modifier — long-period groundswell is more powerful and cleaner.
  if (p >= 14) base += 2;        // long-period groundswell
  else if (p >= 11) base += 1;   // mid-period groundswell
  else if (p > 0 && p < 7) base -= 2; // short-period windswell (choppy, weak)

  // Wind direction modifier — offshore vs swell direction.
  // Wind FROM = meteorological convention. Swell FROM = ocean convention.
  // For a beach where swell comes FROM swellDir, the wave moves TOWARD swellDir+180.
  // Wind FROM windDir moves TOWARD windDir+180.
  // - Offshore: wind moves OPPOSITE to swell → windDir ≈ swellDir + 180 → absDiff ≈ 180
  // - Onshore:  wind moves SAME direction as swell → windDir ≈ swellDir → absDiff ≈ 0
  if (windDirDeg != null && swellDirDeg != null) {
    const diff = ((windDirDeg - swellDirDeg + 540) % 360) - 180;
    const absDiff = Math.abs(diff);
    if (absDiff > 135) base += 1;       // offshore / clean
    else if (absDiff < 45) base -= 1;   // onshore / blown out
    // 45..135 = cross-shore: no modifier
  }

  // Wind speed — strong wind kills quality regardless of direction.
  if (ws > 25) base -= 2;
  else if (ws > 18) base -= 1;

  const score = Math.max(1, Math.min(10, Math.round(base)));

  let label: SurfLabel;
  let summary: string;
  let tone: SurfRating["tone"];
  if (score >= 9) {
    label = "EPIC";   tone = "good";
    summary = "Long-period groundswell, clean conditions";
  } else if (score >= 7) {
    label = "GOOD";   tone = "good";
    summary = "Solid waves, worth paddling out";
  } else if (score >= 5) {
    label = "FAIR";   tone = "fair";
    summary = "Rideable, expect some inconsistency";
  } else if (score >= 3) {
    label = "SMALL";  tone = "caution";
    summary = "Knee to waist — soft closeouts likely";
  } else {
    label = "FLAT";   tone = "danger";
    summary = "Nothing to ride";
  }

  return { score, label, tone, summary, reason };
}

function computeSafetySummary(score: number, ripRisk: string): string {
  if (score >= 9) return "Excellent conditions. Very safe for swimming.";
  if (score >= 7) return "Good conditions. Use normal caution.";
  if (score >= 4) return "Caution advised. Check conditions before entering water.";
  return "Hazardous conditions. Swimming not recommended.";
}

function makeRecommendations(ripRisk: string, waveHeightM: number, windSpeedMph: number, uvIndex: number): string[] {
  const recs: string[] = [];
  if (ripRisk === "High") recs.push("Dangerous rip currents — swim near a lifeguard and never swim alone.");
  else if (ripRisk === "Moderate") recs.push("Moderate rip current risk — exercise caution and ask locals about conditions.");
  if (waveHeightM > 1.5) recs.push("Large waves — not recommended for inexperienced swimmers.");
  if (windSpeedMph > 20) recs.push("Strong winds may make conditions challenging.");
  if (uvIndex >= 8) recs.push("Very high UV — wear sunscreen, hat, and rash guard.");
  else if (uvIndex >= 6) recs.push("High UV — apply and reapply sunscreen.");
  recs.push("Check with local authorities or lifeguards for current beach conditions.");
  return recs;
}

function uvRisk(uv: number): string {
  if (uv >= 11) return "Extreme";
  if (uv >= 8) return "Very High";
  if (uv >= 6) return "High";
  if (uv >= 3) return "Moderate";
  return "Low";
}

// Geocode beach name via Nominatim. Force English results — Nominatim defaults to
// the requester's browser language via accept-language, which on a Chinese-locale
// phone returns Chinese place names. Override with accept-language: en.
async function geocode(beachName: string): Promise<{ lat: number; lon: number; displayName: string; timezone: string } | null> {
  const key = beachName.trim().toLowerCase();
  const hit = geocodeCache.get(key) as { lat: number; lon: number; displayName: string; timezone: string } | undefined;
  if (hit !== undefined) return hit;
  // Marker for "we already looked this up and got nothing". Otherwise an
  // unknown beach would re-hit Nominatim on every request.
  const miss = geocodeCache.get(key + "::miss");
  if (miss !== undefined) return null;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(beachName)}&format=json&limit=1&addressdetails=1&extratags=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BeachSafetyWeb/1.0",
      "accept-language": "en",
    },
  });
  if (!res.ok) {
    // Don't cache failure — could be a transient upstream hiccup.
    return null;
  }
  const data = await res.json();
  if (!data || data.length === 0) {
    geocodeCache.set(key + "::miss", { empty: true }, 30 * 60_000); // 30 min negative cache
    return null;
  }
  const lon = parseFloat(data[0].lon);
  const lat = parseFloat(data[0].lat);
  const result = {
    lat,
    lon,
    displayName: data[0].display_name,
    // Nominatim's extratags sometimes includes `timezone` (e.g. "America/Los_Angeles").
    // Fall back to a longitude-based heuristic for US beaches.
    timezone: data[0].extratags?.timezone ?? inferTimezoneFromLon(lon, lat),
  };
  geocodeCache.set(key, result);
  return result;
}

// Approximate IANA timezone from coordinates. Covers US + Atlantic Canada;
// other regions fall back to UTC. Latitude check for Hawaii is needed because
// Hawaiian longitude falls in the same range as Alaska's.
function inferTimezoneFromLon(lon: number, lat = 0): string {
  // Hawaii: latitude 18-23, longitude roughly -160 to -154. Comes BEFORE Alaska.
  if (lat >= 18 && lat <= 23 && lon >= -162 && lon <= -154) return "Pacific/Honolulu";
  // Puerto Rico / US Virgin Islands (~18N, -67 to -65W) \u2014 Atlantic (AT).
  if (lon >= -68 && lon <= -64 && lat >= 17 && lat <= 19) return "America/Puerto_Rico";
  if (lon >= -67 && lon <= -54) return "America/Halifax"; // AT
  if (lon >= -90 && lon < -67) return "America/New_York"; // ET
  if (lon >= -105 && lon < -90) return "America/Chicago"; // CT
  if (lon >= -120 && lon < -105) return "America/Denver"; // MT
  if (lon >= -130 && lon < -120) return "America/Los_Angeles"; // PT
  if (lon >= -180 && lon < -130 && lat >= 50) return "America/Anchorage"; // AK
  return "UTC";
}

// Fetch marine data (waves, swell) via Open-Meteo Marine API
async function fetchMarine(lat: number, lon: number): Promise<{
  waveHeightM: number;
  wavePeriodSec: number;
  waveDirectionDeg: number;
  swellHeightM: number;
  swellPeriodSec: number;
  swellDirectionDeg: number;
  hourly: {
    time: string[];
    wave_height: number[];
    wave_period: (number | null)[];
    wave_direction: (number | null)[];
    swell_wave_height: (number | null)[];
    swell_wave_period: (number | null)[];
    swell_wave_direction: (number | null)[];
  };
  daily: {
    time: string[];
    wave_height_max: (number | null)[];
    wave_period_max: (number | null)[];
  };
}> {
  const url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&current=wave_height,wave_direction,wave_period` +
    `&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction` +
    `&daily=wave_height_max,wave_period_max` +
    `&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Marine API error");
  const data = await res.json();
  const current = data.current ?? {};
  const h = data.hourly ?? {};
  const d = data.daily ?? {};
  return {
    waveHeightM: current.wave_height ?? 0,
    wavePeriodSec: current.wave_period ?? 0,
    waveDirectionDeg: current.wave_direction ?? 0,
    swellHeightM: current.wave_height ?? 0,
    swellPeriodSec: current.wave_period ?? 0,
    swellDirectionDeg: current.wave_direction ?? 0,
    hourly: {
      time: h.time ?? [],
      wave_height: h.wave_height ?? [],
      wave_period: h.wave_period ?? [],
      wave_direction: h.wave_direction ?? [],
      swell_wave_height: h.swell_wave_height ?? [],
      swell_wave_period: h.swell_wave_period ?? [],
      swell_wave_direction: h.swell_wave_direction ?? [],
    },
    daily: {
      time: d.time ?? [],
      wave_height_max: d.wave_height_max ?? [],
      wave_period_max: d.wave_period_max ?? [],
    },
  };
}

// ── NOAA tide predictions ───────────────────────────────────────────────────
interface TideStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm?: number;
}

const tideStationsCache: { ts: number; stations: TideStation[] } | null = null;
let tideStationCacheTs = 0;

async function loadTideStations(): Promise<TideStation[]> {
  // Cache for 24h — station list barely changes
  if (tideStationsCache && Date.now() - tideStationCacheTs < 86400000) {
    return tideStationsCache.stations;
  }
  try {
    const res = await fetch(
      "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions",
      { headers: { "User-Agent": "BeachSafetyWeb/1.0 (contact@beachconditions.app)" } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const stations: TideStation[] = (data.stations ?? [])
      .map((s: any) => ({
        id: String(s.id),
        name: String(s.name ?? ""),
        lat: parseFloat(s.lat),
        lon: parseFloat(s.lng ?? s.lon),
      }))
      .filter((s: TideStation) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
    tideStationCacheTs = Date.now();
    return stations;
  } catch {
    return [];
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearestTideStations(lat: number, lon: number, limit = 5): Promise<TideStation[]> {
  const stations = await loadTideStations();
  if (stations.length === 0) return [];
  // Sort by distance and return top-N candidates — caller will try each
  // because not every station in the list has active hourly predictions.
  const sorted = stations
    .map(s => ({ ...s, distanceKm: haversineKm(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, limit);
  return sorted;
}

export interface TideData {
  available: boolean;
  stationId?: string;
  stationName?: string;
  distanceKm?: number;
  currentHeightFt?: number | null;
  trend?: "rising" | "falling" | "high" | "low" | "unknown";
  nextHigh?: { time: string; heightFt: number } | null;
  nextLow?: { time: string; heightFt: number } | null;
  hourly?: { time: string; heightFt: number }[];
  error?: string;
}

async function fetchTide(lat: number, lon: number): Promise<TideData> {
  try {
    const candidates = await findNearestTideStations(lat, lon);
    if (!candidates || candidates.length === 0) {
      return { available: false, error: "No tide station within range" };
    }

    // Fetch hourly predictions for today + tomorrow in LST/LDT, English units.
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const tomorrow = new Date(today.getTime() + 86400000);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10).replace(/-/g, "");
    const beginDate = `${todayStr} 00:00`;
    const endDate = `${tomorrowStr} 23:59`;

    // Try each candidate station in order until one returns predictions.
    let station: (typeof candidates)[0] | null = null;
    let predictions: { t: string; v: string }[] = [];
    for (const cand of candidates) {
      // Reject absurdly distant stations
      if (cand.distanceKm && cand.distanceKm > 300) {
        return { available: false, stationId: cand.id, stationName: cand.name, distanceKm: cand.distanceKm, error: "Nearest station too far" };
      }
      const url =
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
        `?station=${cand.id}&product=predictions&datum=MLLW` +
        `&interval=h&units=english&time_zone=lst_ldt&format=json` +
        `&begin_date=${beginDate}&end_date=${endDate}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "BeachSafetyWeb/1.0 (contact@beachconditions.app)" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const preds = data.predictions ?? [];
      if (preds.length > 0) {
        station = cand;
        predictions = preds;
        break;
      }
    }
    if (!station || predictions.length === 0) {
      return { available: false, error: "No active tide stations nearby" };
    }

    // Find current hour — NOAA time is local (e.g., "2026-07-14 12:00" in Pacific).
    // Parse each entry as a Date and pick the closest to now.
    const hourly: { time: string; heightFt: number; hourMs: number }[] = predictions.map(p => ({
      time: p.t,
      heightFt: parseFloat(p.v),
      // NOAA format "YYYY-MM-DD HH:MM" — local tide-station time. We can't
      // reliably parse this as UTC, so don't compare against Date.now();
      // instead, use the LOCAL hour to find the floor-of-hour match.
      hourMs: parseInt(p.t.slice(11, 13), 10),
    }));
    // Build a wall-clock "now" from the most recent date in the predictions
    // (assume today = first prediction date, EDT offset).
    const now = new Date();
    const nowHour = now.getHours(); // local hour
    // Find the prediction hour ≤ nowHour that's closest.
    let currentIdx = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < hourly.length; i++) {
      const delta = nowHour - hourly[i].hourMs;
      if (delta >= 0 && delta < bestDelta) { bestDelta = delta; currentIdx = i; }
    }
    const current = hourly[currentIdx];

    // Trend = compare to previous hour
    let trend: TideData["trend"] = "unknown";
    if (currentIdx > 0) {
      const prev = hourly[currentIdx - 1];
      const diff = current.heightFt - prev.heightFt;
      if (Math.abs(diff) < 0.05) {
        if (currentIdx + 1 < hourly.length) {
          const next = hourly[currentIdx + 1];
          trend = next.heightFt > current.heightFt ? "low" : "high";
        }
      } else {
        trend = diff > 0 ? "rising" : "falling";
      }
    }

    // Next high/low — find local extrema after currentIdx.
    let nextHigh: { time: string; heightFt: number } | null = null;
    let nextLow: { time: string; heightFt: number } | null = null;
    for (let i = currentIdx; i < hourly.length - 1; i++) {
      const cur = hourly[i];
      const next = hourly[i + 1];
      if (!nextHigh && next.heightFt > cur.heightFt) {
        // Walk to the peak
        let peak = cur;
        let peakIdx = i;
        while (peakIdx < hourly.length - 1 && hourly[peakIdx + 1].heightFt > peak.heightFt) {
          peakIdx += 1;
          peak = hourly[peakIdx];
        }
        nextHigh = { time: peak.time, heightFt: peak.heightFt };
      }
      if (!nextLow && next.heightFt < cur.heightFt) {
        let trough = cur;
        let troughIdx = i;
        while (troughIdx < hourly.length - 1 && hourly[troughIdx + 1].heightFt < trough.heightFt) {
          troughIdx += 1;
          trough = hourly[troughIdx];
        }
        nextLow = { time: trough.time, heightFt: trough.heightFt };
      }
      if (nextHigh && nextLow) break;
    }

    return {
      available: true,
      stationId: station.id,
      stationName: station.name,
      distanceKm: station.distanceKm,
      currentHeightFt: parseFloat(Math.abs(current.heightFt) < 0.04 ? "0" : current.heightFt.toFixed(1)),
      trend,
      nextHigh,
      nextLow,
      hourly: hourly.map(h => ({ time: h.time, heightFt: h.heightFt })),
    };
  } catch (e) {
    return { available: false, error: `Tide fetch failed: ${String(e)}` };
  }
}

// Fetch NOAA surf zone forecast for US beaches
async function fetchNoaaSurfZone(lat: number, lon: number): Promise<{ ripRisk: string; forecast: string }> {
  try {
    // Step 1: Get the forecast office + grid coordinates
    const pointsRes = await fetch(
      `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { "User-Agent": "BeachSafetyWeb/1.0 (contact@beachconditions.app)" } }
    );
    if (!pointsRes.ok) return { ripRisk: "", forecast: "" };
    const pointsData = await pointsRes.json();
    const { gridId, gridX, gridY } = pointsData.properties;
    if (!gridId || gridX == null || gridY == null) return { ripRisk: "", forecast: "" };

    // Step 2: Get surf zone forecast
    const forecastRes = await fetch(
      `https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}/forecast`,
      { headers: { "User-Agent": "BeachSafetyWeb/1.0 (contact@beachconditions.app)" } }
    );
    if (!forecastRes.ok) return { ripRisk: "", forecast: "" };
    const forecastData = await forecastRes.json();
    const periods = forecastData.properties?.periods ?? [];
    const first = periods[0] ?? {};
    const text = first.shortForecast ?? "";
    const detailed = first.detailedForecast ?? "";

    // Parse rip current risk from forecast text
    let ripRisk = "";
    const lower = (text + " " + detailed).toLowerCase();
    if (lower.includes("high rip") || lower.includes("dangerous rip") || lower.includes("life-threatening rip")) {
      ripRisk = "High";
    } else if (lower.includes("moderate rip") || lower.includes("rip currents possible")) {
      ripRisk = "Moderate";
    } else if (lower.includes("low rip") || lower.includes("rip current risk")) {
      ripRisk = "Low";
    }

    return { ripRisk, forecast: text };
  } catch {
    return { ripRisk: "", forecast: "" };
  }
}

// Fetch weather data (wind, air temp, water temp, UV) via Open-Meteo Weather API
async function fetchWeather(lat: number, lon: number): Promise<{
  airTempC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  waterTempC: number;
  uvIndex: number;
  hourly: {
    time: string[];
    temperature_2m: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_direction_10m: (number | null)[];
    uv_index: (number | null)[];
    cloud_cover: (number | null)[];
  };
  daily: {
    time: string[];
    uv_index_max: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_probability_max: (number | null)[];
    sunrise: (string | null)[];
    sunset: (string | null)[];
  };
}> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index,cloud_cover` +
    `&daily=uv_index_max,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
    `&forecast_days=7&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather API error");
  const data = await res.json();
  const current = data.current ?? {};
  const daily = data.daily ?? {};
  const hourly = data.hourly ?? {};
  return {
    airTempC: current.temperature_2m ?? 0,
    windSpeedMs: (current.wind_speed_10m ?? 0) / 3.6, // API returns km/h, convert to m/s
    windDirectionDeg: current.wind_direction_10m ?? 0,
    waterTempC: 20, // Water temp not available in weather API
    uvIndex: current.uv_index ?? daily.uv_index_max?.[0] ?? 0,
    hourly: {
      time: hourly.time ?? [],
      temperature_2m: hourly.temperature_2m ?? [],
      wind_speed_10m: hourly.wind_speed_10m ?? [],
      wind_direction_10m: hourly.wind_direction_10m ?? [],
      uv_index: hourly.uv_index ?? [],
      cloud_cover: hourly.cloud_cover ?? [],
    },
    daily: {
      time: daily.time ?? [],
      uv_index_max: daily.uv_index_max ?? [],
      temperature_2m_max: daily.temperature_2m_max ?? [],
      temperature_2m_min: daily.temperature_2m_min ?? [],
      precipitation_probability_max: daily.precipitation_probability_max ?? [],
      sunrise: daily.sunrise ?? [],
      sunset: daily.sunset ?? [],
    },
  };
}

export async function getBeachData(beachName: string): Promise<BeachData> {
  try {
    // 1. Geocode
    const geo = await geocode(beachName);
    if (!geo) {
      return emptyBeachData(beachName, `Could not find beach: ${beachName}`);
    }

    // 2. Fetch marine + weather + NOAA in parallel
    // Tide only for US territories (NOAA CO-OPS coverage); otherwise graceful skip.
    const isUS = geo.lat >= 18 && geo.lat <= 72 && geo.lon >= -180 && geo.lon <= -50;
    const [marine, weather, noaa, tide] = await Promise.all([
      fetchMarine(geo.lat, geo.lon),
      fetchWeather(geo.lat, geo.lon),
      fetchNoaaSurfZone(geo.lat, geo.lon),
      isUS ? fetchTide(geo.lat, geo.lon) : Promise.resolve({ available: false } as TideData),
    ]);

    const waveHeightM = marine.waveHeightM;
    const waveHeightFt = waveHeightM * 3.28084;
    const swellHeightM = marine.swellHeightM;
    const swellHeightFt = swellHeightM * 3.28084;
    const windSpeedMph = msToMph(weather.windSpeedMs);
    const airTempF = celsiusToFahrenheit(weather.airTempC);
    const waterTempF = celsiusToFahrenheit(weather.waterTempC);
    const uvIndex = weather.uvIndex;

    const ripRisk = noaa.ripRisk || computeRipRisk(waveHeightM, windSpeedMph);
    const safetyScore = computeSafetyScore(ripRisk, waveHeightM, windSpeedMph);
    const safetySummary = computeSafetySummary(safetyScore, ripRisk);
    const recommendations = makeRecommendations(ripRisk, waveHeightM, windSpeedMph, uvIndex);

    const now = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

    // ── Hourly forecast (168h = 7 days, zip-merged marine+weather) ──────────
    const mh = marine.hourly;
    const wh = weather.hourly;
    const hourly: HourlyForecastPoint[] = mh.time.map((t, i) => {
      const hour = parseInt(t.slice(11, 13), 10);
      const hourWaveFt = (mh.wave_height[i] ?? 0) * 3.28084;
      const hourSwellFt = ((mh.swell_wave_height[i] ?? mh.wave_height[i] ?? 0) as number) * 3.28084;
      const hourWindMph = msToMph((wh.wind_speed_10m[i] ?? 0) / 3.6);
      const hourWindDeg = wh.wind_direction_10m[i] ?? 0;
      const hourSwellDir = mh.swell_wave_direction[i] ?? mh.wave_direction[i] ?? null;
      return {
        time: t,
        hour,
        waveHeightFt: parseFloat(hourWaveFt.toFixed(1)),
        wavePeriodSec: mh.wave_period[i] ?? null,
        waveDirectionDeg: mh.wave_direction[i] ?? null,
        waveDirectionCardinal: degToCardinal(mh.wave_direction[i] ?? 0),
        swellHeightFt: parseFloat(hourSwellFt.toFixed(1)),
        swellPeriodSec: mh.swell_wave_period[i] ?? null,
        swellDirectionDeg: hourSwellDir,
        swellDirectionCardinal: degToCardinal(hourSwellDir ?? 0),
        windSpeedMph: Math.round(hourWindMph),
        windDirectionDeg: hourWindDeg,
        windDirectionCardinal: degToCardinal(hourWindDeg),
        uvIndex: wh.uv_index[i] ?? 0,
        airTempF: Math.round(celsiusToFahrenheit(wh.temperature_2m[i] ?? 0)),
        cloudCoverPct: wh.cloud_cover[i] ?? 0,
        surfRating: computeSurfRating(
          hourWaveFt,
          mh.wave_period[i] ?? null,
          hourWindDeg,
          hourSwellDir,
          hourWindMph,
        ),
      };
    });

    // ── Daily forecast (7 days) ─────────────────────────────────────────────
    const md = marine.daily;
    const wd = weather.daily;
    const daily: DailyForecastDay[] = md.time.map((date, i) => {
      const dayDate = new Date(date + "T12:00:00"); // noon to avoid TZ edges
      const dayName = dayDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
      const dayDateLabel = dayDate.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase();
      const waveMaxM = md.wave_height_max[i] ?? 0;
      const waveMaxFt = waveMaxM * 3.28084;

      // Best hour this day = hour with highest surf rating
      const dayHours = hourly.filter(h => h.time.startsWith(date));
      let bestRating: SurfRating = { score: 0, label: "FLAT", tone: "caution", summary: "", reason: "—" };
      let bestHour: number | null = null;
      for (const h of dayHours) {
        if (h.surfRating.score > bestRating.score) {
          bestRating = h.surfRating;
          bestHour = h.hour;
        }
      }

      // Find the longest contiguous run of FAIR-or-better hours during
      // daylight (5am–9pm). Surfers paddle out in daylight; rating a day on
      // its 3 AM wind-blown peak is misleading.
      let bestWindow: { startHour: number; endHour: number } | null = null;
      let runStart: number | null = null;
      let runLen = 0;
      let bestRunLen = 0;
      for (let hour = 5; hour <= 21; hour++) {
        const h = dayHours.find(x => x.hour === hour);
        const isFair = h != null && h.surfRating.score >= 5;
        if (isFair) {
          if (runStart == null) runStart = hour;
          runLen += 1;
          if (runLen > bestRunLen) {
            bestRunLen = runLen;
            bestWindow = { startHour: runStart, endHour: hour + 1 };
          }
        } else {
          runStart = null;
          runLen = 0;
        }
      }
      // Only surface the window if it's at least 3 hours long — anything
      // shorter is "there's a brief moment" which doesn't help decisions.
      if (bestWindow && bestRunLen < 3) bestWindow = null;

      return {
        date,
        dayName,
        dayDate: dayDateLabel,
        waveMaxFt: parseFloat(waveMaxFt.toFixed(1)),
        wavePeriodMaxSec: md.wave_period_max[i] ?? null,
        uvMax: wd.uv_index_max[i] ?? 0,
        tempMaxF: Math.round(celsiusToFahrenheit(wd.temperature_2m_max[i] ?? 0)),
        tempMinF: Math.round(celsiusToFahrenheit(wd.temperature_2m_min[i] ?? 0)),
        rainProbPct: wd.precipitation_probability_max[i] ?? 0,
        bestRating,
        bestHour,
        bestWindow,
        sunrise: wd.sunrise[i] ?? null,
        sunset: wd.sunset[i] ?? null,
      };
    });

    return {
      beach_name: geo.displayName,
      latitude: geo.lat,
      longitude: geo.lon,
      timezone: geo.timezone,
      timestamp_utc: now,
      rip_current_risk: ripRisk,
      surf_height: `${waveHeightFt.toFixed(1)} ft`,
      water_quality: "Unknown — check locally",
      safety_score: safetyScore,
      safety_summary: safetySummary,
      surf_rating: computeSurfRating(
        waveHeightFt,
        marine.wavePeriodSec ?? null,
        weather.windDirectionDeg ?? null,
        marine.swellDirectionDeg ?? null,
        windSpeedMph,
      ),
      recommendations,
      uv_index: uvIndex,
      uv_risk: uvRisk(uvIndex),
      air_temperature_f: Math.round(airTempF),
      water_temperature_f: Math.round(waterTempF),
      wave: {
        height_m: waveHeightM,
        height_ft: parseFloat(waveHeightFt.toFixed(1)),
        period_sec: marine.wavePeriodSec || null,
        direction_deg: marine.waveDirectionDeg || null,
        direction_cardinal: degToCardinal(marine.waveDirectionDeg),
      },
      swell: {
        height_m: swellHeightM,
        height_ft: parseFloat(swellHeightFt.toFixed(1)),
        period_sec: marine.swellPeriodSec || null,
        direction_deg: marine.swellDirectionDeg || null,
        direction_cardinal: degToCardinal(marine.swellDirectionDeg),
      },
      wind: {
        speed_mph: Math.round(windSpeedMph),
        direction_deg: weather.windDirectionDeg || null,
        direction_cardinal: degToCardinal(weather.windDirectionDeg),
        speed_text: windSpeedMph < 10 ? "Light" : windSpeedMph < 20 ? "Moderate" : "Strong",
      },
      ocean: {
        current_speed_knots: null,
        current_direction_deg: null,
        tide_status: null,
      },
      sun: {
        sunrise: wd.sunrise[0] ?? null,
        sunset: wd.sunset[0] ?? null,
      },
      weather_forecast: noaa.forecast || null,
      hourly,
      daily,
      tide,
    };
  } catch (e) {
    return emptyBeachData(beachName, `API error: ${String(e)}`);
  }
}

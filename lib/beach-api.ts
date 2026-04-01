/**
 * Beach Safety API — pure JavaScript, no Python/MCP dependencies.
 * Uses free public APIs: Nominatim (geocoding), Open-Meteo Marine & Weather.
 */

export interface BeachData {
  beach_name: string;
  latitude: number;
  longitude: number;
  timestamp_utc: string;
  rip_current_risk: string;
  surf_height: string;
  water_quality: string;
  safety_score: number;
  safety_summary: string;
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
  error?: string;
}

function emptyBeachData(beachName: string, errorMsg = "No data"): BeachData {
  return {
    error: errorMsg,
    beach_name: beachName,
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

// Geocode beach name via Nominatim
async function geocode(beachName: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(beachName)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": "BeachSafetyWeb/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// Fetch marine data (waves, swell) via Open-Meteo Marine API
async function fetchMarine(lat: number, lon: number): Promise<{
  waveHeightM: number;
  wavePeriodSec: number;
  waveDirectionDeg: number;
  swellHeightM: number;
  swellPeriodSec: number;
  swellDirectionDeg: number;
}> {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction,wave_period&daily=wave_height_max&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Marine API error");
  const data = await res.json();
  const current = data.current ?? {};
  return {
    waveHeightM: current.wave_height ?? 0,
    wavePeriodSec: current.wave_period ?? 0,
    waveDirectionDeg: current.wave_direction ?? 0,
    swellHeightM: current.wave_height ?? 0,
    swellPeriodSec: current.wave_period ?? 0,
    swellDirectionDeg: current.wave_direction ?? 0,
  };
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
}> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=air_temperature,wind_speed_10m,wind_direction_10m,uv_index&daily=water_temperature_max&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather API error");
  const data = await res.json();
  const current = data.current ?? {};
  const daily = data.daily ?? {};
  return {
    airTempC: current.air_temperature ?? 0,
    windSpeedMs: current.wind_speed_10m ?? 0,
    windDirectionDeg: current.wind_direction_10m ?? 0,
    waterTempC: daily.water_temperature_max?.[0] ?? 20,
    uvIndex: current.uv_index ?? 0,
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
    const [marine, weather, noaa] = await Promise.all([
      fetchMarine(geo.lat, geo.lon),
      fetchWeather(geo.lat, geo.lon),
      fetchNoaaSurfZone(geo.lat, geo.lon),
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

    return {
      beach_name: geo.displayName,
      latitude: geo.lat,
      longitude: geo.lon,
      timestamp_utc: now,
      rip_current_risk: ripRisk,
      surf_height: `${waveHeightFt.toFixed(1)} ft`,
      water_quality: "Unknown — check locally",
      safety_score: safetyScore,
      safety_summary: safetySummary,
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
      sun: { sunrise: null, sunset: null },
      weather_forecast: noaa.forecast || null,
    };
  } catch (e) {
    return emptyBeachData(beachName, `API error: ${String(e)}`);
  }
}

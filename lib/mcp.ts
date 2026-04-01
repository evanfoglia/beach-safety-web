import { spawn } from "child_process";

const SERVER_PATH = "/Users/evanfoglia/.openclaw/workspace/projects/beach-safety-mcp/src/server.py";

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

export async function getBeachData(beachName: string): Promise<BeachData> {
  return new Promise((resolve) => {
    const initReq = {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "beach-safety-web", version: "1.0.0" },
      },
    };

    const toolReq = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_beach_json",
        arguments: { beach_name: beachName },
      },
    };

    const proc = spawn("python3", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", () => {
      try {
        // The server outputs multiple JSON lines: init response + tool response
        // Find the line with id:1 (tool response) and parse it
        const lines = stdout.trim().split("\n");
        let toolResponse = null;

        for (const line of lines) {
          const parsed = JSON.parse(line.trim());
          if (parsed.id === 1) {
            toolResponse = parsed;
            break;
          }
        }

        if (!toolResponse) {
          resolve(emptyBeachData(beachName, `Unexpected MCP response: ${stdout.slice(0, 200)}`));
          return;
        }

        const content = toolResponse?.result?.content;
        if (content && content[0]?.text) {
          let text = content[0].text;
          // Server returns Python dict syntax (single quotes) — convert to valid JSON
          // Handle None -> null, True/False -> true/false, and ' -> "
          text = text
            .replace(/'/g, '"')
            .replace(/\bNone\b/g, "null")
            .replace(/\bTrue\b/g, "true")
            .replace(/\bFalse\b/g, "false");
          const data = JSON.parse(text);
          resolve(data as BeachData);
        } else {
          resolve(emptyBeachData(beachName, "No content in MCP response"));
        }
      } catch (e) {
        resolve(emptyBeachData(beachName, `Parse error: ${stderr || String(e)}`));
      }
    });

    proc.stdin.write(JSON.stringify(initReq) + "\n");
    proc.stdin.write(JSON.stringify(toolReq) + "\n");
    proc.stdin.end();
  });
}

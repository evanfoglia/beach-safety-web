"use client";

import SafetyBadge from "./SafetyBadge";
import StatBlock from "./StatBlock";
import type { BeachData } from "@/lib/beach-api";
import {
  Waves,
  Wind,
  Thermometer,
  Sun,
  MapPin,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

interface BeachCardProps {
  data: BeachData;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

const RIP_COLOR: Record<string, string> = {
  High: "bg-red-500/20 text-red-400 border-red-500/40",
  Moderate: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  Low: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  Unknown: "bg-slate-500/20 text-slate-400 border-slate-500/40",
};

export default function BeachCard({ data, isFavorite, onToggleFavorite }: BeachCardProps) {
  const ripClass = RIP_COLOR[data.rip_current_risk] ?? RIP_COLOR.Unknown;

  const waveFt =
    data.wave.height_ft != null ? data.wave.height_ft.toFixed(1) : "—";
  const swellFt =
    data.swell.height_ft != null && data.swell.height_ft > 0
      ? data.swell.height_ft.toFixed(1)
      : "—";
  const swellSec = data.swell.period_sec ?? "—";
  const windMph = data.wind.speed_mph ?? "—";
  const airTemp =
    data.air_temperature_f != null
      ? `${data.air_temperature_f.toFixed(0)}°F`
      : "—";
  const waterTemp =
    data.water_temperature_f != null
      ? `${data.water_temperature_f.toFixed(0)}°F`
      : "—";
  const uvVal = data.uv_index != null ? data.uv_index.toFixed(0) : "—";

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-6 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-slate-100 truncate">
            {data.beach_name}
          </h2>
          <div className="flex items-center gap-1.5 text-slate-400 text-sm font-mono mt-0.5">
            <MapPin size={13} className="text-cyan-400 shrink-0" />
            <span>
              {data.latitude.toFixed(4)}°N, {data.longitude.toFixed(4)}°W
            </span>
          </div>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Updated {data.timestamp_utc}
          </p>
        </div>

        {/* Favorite button */}
        <button
          onClick={onToggleFavorite}
          className="shrink-0 p-2 rounded-xl transition-colors hover:bg-slate-700/60"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={isFavorite ? "#facc15" : "none"}
            stroke={isFavorite ? "#facc15" : "#64748b"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </div>

      {/* Safety Score + Rip */}
      <div className="flex items-center gap-6">
        <SafetyBadge score={data.safety_score} />

        <div className="flex-1 space-y-3">
          {/* Rip Risk Badge */}
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
              Rip Current Risk
            </span>
            <div className="mt-1">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${ripClass}`}
              >
                <AlertTriangle size={11} />
                {data.rip_current_risk}
              </span>
            </div>
          </div>

          {/* UV Index */}
          <div>
            <span className="text-xs text-slate-400 uppercase tracking-wider font-mono">
              UV Index
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-mono font-semibold text-slate-100">
                {uvVal}
              </span>
              <span className="text-xs text-slate-400">{data.uv_risk}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wave / Swell / Wind Grid */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700/40">
        <div className="space-y-3">
          <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-mono font-semibold">
            Waves
          </h3>
          <StatBlock
            label="Wave Height"
            value={waveFt}
            sub="ft"
            icon={<Waves size={12} />}
          />
          {data.wave.period_sec && (
            <StatBlock label="Wave Period" value={`${data.wave.period_sec}s`} />
          )}
          {data.wave.direction_cardinal && data.wave.direction_cardinal !== "N/A" && (
            <StatBlock label="Direction" value={data.wave.direction_cardinal} />
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-mono font-semibold">
            Swell
          </h3>
          <StatBlock label="Swell Height" value={swellFt} sub="ft" />
          {swellSec !== "—" && (
            <StatBlock label="Swell Period" value={`${swellSec}s`} />
          )}
          {data.swell.direction_cardinal &&
            data.swell.direction_cardinal !== "N/A" && (
              <StatBlock label="Direction" value={data.swell.direction_cardinal} />
            )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-mono font-semibold">
            Wind
          </h3>
          <StatBlock
            label="Speed"
            value={windMph}
            sub="mph"
            icon={<Wind size={12} />}
          />
          {data.wind.direction_cardinal &&
            data.wind.direction_cardinal !== "N/A" && (
              <StatBlock label="From" value={data.wind.direction_cardinal} />
            )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-mono font-semibold">
            Temp
          </h3>
          <StatBlock
            label="Air"
            value={airTemp}
            icon={<Thermometer size={12} />}
          />
          <StatBlock label="Water" value={waterTemp} icon={<Thermometer size={12} />} />
        </div>
      </div>

      {/* Weather forecast */}
      {data.weather_forecast && (
        <p className="text-sm text-slate-300 italic border-l-2 border-cyan-500 pl-3">
          {data.weather_forecast}
        </p>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div>
          <h3 className="text-xs text-cyan-400 uppercase tracking-widest font-mono font-semibold mb-2">
            Recommendations
          </h3>
          <ul className="space-y-1.5">
            {data.recommendations.map((rec, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-slate-300"
              >
                <ChevronRight
                  size={14}
                  className="text-cyan-400 mt-0.5 shrink-0"
                />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

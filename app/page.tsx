"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { BeachData } from "@/lib/beach-api";

const STORAGE_KEY = "wbr-favorites";

function conditionRating(score: number | null | undefined): {
  label: string;
  tone: "good" | "fair" | "caution" | "danger";
  detail: string;
} {
  if (score == null) return { label: "—", tone: "fair", detail: "Awaiting data" };
  if (score >= 9) return { label: "EPIC", tone: "good", detail: "Get in the water" };
  if (score >= 7) return { label: "GOOD", tone: "good", detail: "Favorable conditions" };
  if (score >= 4) return { label: "FAIR", tone: "fair", detail: "Use judgment" };
  return { label: "ROUGH", tone: "danger", detail: "Caution advised" };
}

function formatLocalDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }).toUpperCase();
}

function summarizeConditions(d: BeachData | null): string {
  if (!d) return "Search any beach to see real-time conditions, safety, and surf forecast.";
  const parts: string[] = [];
  if (d.wave.height_ft) parts.push(`${d.wave.height_ft.toFixed(1)} ft ${d.wave.direction_cardinal}`);
  if (d.wind.speed_mph != null) parts.push(`${Math.round(d.wind.speed_mph)} mph ${d.wind.direction_cardinal}`);
  if (d.air_temperature_f != null) parts.push(`${Math.round(d.air_temperature_f)}°F`);
  return parts.length ? parts.join(" · ") : "Data unavailable";
}

export default function Page() {
  const [query, setQuery] = useState("");
  const [beachData, setBeachData] = useState<BeachData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"mcp" | "js" | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  const searchBeach = useCallback(async (beachName: string) => {
    setLoading(true);
    setError(null);
    setBeachData(null);
    setSource(null);
    try {
      const res = await fetch(`/api/beach?beach=${encodeURIComponent(beachName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBeachData(data);
      setSource(data._source === "mcp" ? "mcp" : "js");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch beach data");
    } finally {
      setLoading(false);
    }
  }, []);

  const isFavorite = beachData ? favorites.includes(beachData.beach_name) : false;
  const rating = useMemo(() => conditionRating(beachData?.safety_score), [beachData]);
  const today = now ? formatLocalDate(now) : "—";
  const beachShortName = beachData
    ? beachData.beach_name.split(",")[0].toUpperCase()
    : "WEST SHORE";

  return (
    <div className="relative min-h-screen flex">
      {/* Fixed left sidebar — vertical icon rail */}
      <Sidebar />

      {/* Hero — full-bleed background image */}
      <main className="flex-1 relative min-h-screen overflow-hidden">
        <HeroImage />

        {/* Top bar — wordmark + date + location */}
        <TopBar
          beachLabel={beachShortName}
          date={today}
          lat={beachData?.latitude ?? null}
          lon={beachData?.longitude ?? null}
        />

        {/* Hero content — search + condition rating + summary */}
        <section className="absolute inset-0 z-10 flex flex-col justify-end pb-12 px-8 md:px-16 lg:px-24 max-w-5xl pointer-events-none">
          <div className="pointer-events-auto space-y-8">
            {/* Wordmark */}
            <div className="space-y-2">
              <p className="text-xs tracking-[0.4em] text-teal-300 uppercase font-mono">
                Weather and beach report
              </p>
              <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-black leading-[0.95] text-white tracking-tight">
                {beachShortName}
              </h1>
            </div>

            {/* Condition rating + summary */}
            <div className="flex flex-wrap items-end gap-6 md:gap-10">
              <ConditionBadge label={rating.label} tone={rating.tone} />
              <div className="space-y-1 max-w-md">
                <p className="text-lg md:text-xl text-slate-100 font-light italic">
                  {summarizeConditions(beachData)}
                </p>
                {beachData && (
                  <p className="text-xs text-slate-300/80 font-mono tracking-wide">
                    {rating.detail} · rip risk {beachData.rip_current_risk} · UV {beachData.uv_index ?? "—"}{" "}
                    <SourceChip source={source} />
                  </p>
                )}
                {!beachData && (
                  <p className="text-xs text-slate-300/70 font-mono tracking-wide">
                    {rating.detail}
                  </p>
                )}
              </div>
            </div>

            {/* Search bar */}
            <SearchBar
              value={query}
              onChange={setQuery}
              onSearch={searchBeach}
              loading={loading}
            />

            {error && (
              <p className="text-sm text-rose-300 font-mono">
                <span className="opacity-60">error:</span> {error}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function Sidebar() {
  const items = [
    { key: "surf", label: "Surf", active: true },
    { key: "travel", label: "Travel" },
    { key: "sleep", label: "Sleep" },
    { key: "shop", label: "Shop" },
    { key: "search", label: "Search" },
  ];
  return (
    <aside className="hidden md:flex flex-col items-center justify-between w-16 lg:w-20 shrink-0 bg-slate-950/80 backdrop-blur-md border-r border-white/5 py-8 z-20">
      <div className="flex flex-col items-center gap-6">
        {items.map((it) => (
          <button
            key={it.key}
            className={`group flex flex-col items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${
              it.active ? "text-teal-300" : "text-slate-500 hover:text-slate-200"
            }`}
            title={it.label}
          >
            <span className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors ${
              it.active
                ? "border-teal-400/60 bg-teal-400/10"
                : "border-white/10 group-hover:border-white/30"
            }`}>
              <SidebarIcon name={it.key} />
            </span>
          </button>
        ))}
      </div>
      <div className="text-[9px] font-mono text-slate-600 tracking-widest uppercase">
        v1
      </div>
    </aside>
  );
}

function SidebarIcon({ name }: { name: string }) {
  const common = "w-4 h-4";
  switch (name) {
    case "surf":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
          <path d="M2 14c2-1 3-2 5 0s3 2 5 0 3-2 5 0 3 2 5 0" strokeLinecap="round" />
          <path d="M2 19c2-1 3-2 5 0s3 2 5 0 3-2 5 0 3 2 5 0" strokeLinecap="round" opacity="0.5" />
        </svg>
      );
    case "travel":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
          <path d="M3 12h18M12 3v18M5 7c0 4 7 13 7 13M19 7c0 4-7 13-7 13" strokeLinecap="round" />
        </svg>
      );
    case "sleep":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case "shop":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
          <path d="M3 9l1.5-5h15L21 9M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18M9 13a3 3 0 0 0 6 0" strokeLinecap="round" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function HeroImage() {
  return (
    <div className="absolute inset-0">
      <img
        src="/hero-wave.jpg"
        alt=""
        className="w-full h-full object-cover object-[center_30%] wave-pulse"
      />
      <div className="absolute inset-0 hero-overlay" />
    </div>
  );
}

function TopBar({
  beachLabel,
  date,
  lat,
  lon,
}: {
  beachLabel: string;
  date: string;
  lat: number | null;
  lon: number | null;
}) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 px-8 md:px-16 lg:px-24 pt-8 flex items-start justify-between pointer-events-none">
      <div className="space-y-0.5 pointer-events-auto">
        <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-slate-300/70">
          {beachLabel}
        </p>
        <p className="text-sm font-mono text-slate-200">{date}</p>
      </div>
      {lat != null && lon != null && (
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-300/70 pointer-events-auto">
          {lat.toFixed(3)}°N · {Math.abs(lon).toFixed(3)}°W
        </p>
      )}
    </div>
  );
}

function ConditionBadge({ label, tone }: { label: string; tone: "good" | "fair" | "caution" | "danger" }) {
  const colorMap = {
    good: "text-emerald-300 border-emerald-400/40",
    fair: "text-amber-300 border-amber-400/40",
    caution: "text-amber-200 border-amber-300/40",
    danger: "text-rose-300 border-rose-400/40",
  } as const;
  return (
    <div className={`inline-flex flex-col items-start gap-1 border-l-2 pl-4 ${colorMap[tone]}`}>
      <span className="text-[10px] font-mono uppercase tracking-[0.4em] opacity-70">Condition</span>
      <span className="font-serif text-4xl md:text-5xl font-black tracking-tight">{label}</span>
    </div>
  );
}

function SourceChip({ source }: { source: "mcp" | "js" | null }) {
  if (!source) return null;
  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest border ${
        source === "mcp"
          ? "border-teal-400/40 text-teal-300 bg-teal-400/5"
          : "border-slate-400/40 text-slate-300 bg-slate-400/5"
      }`}
      title={source === "mcp" ? "Data from live MCP server" : "Data from JS fallback"}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${source === "mcp" ? "bg-teal-300" : "bg-slate-300"}`} />
      {source}
    </span>
  );
}

function SearchBar({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (v: string) => void;
  loading: boolean;
}) {
  return (
    <div className="border-b border-white/20 pb-3 flex items-center gap-3">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="w-5 h-5 text-slate-300/80"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSearch(value.trim());
        }}
        placeholder='Try "Juno Pier", "Bondi Beach", "Waikiki"…'
        className="ghost-input text-xl md:text-2xl font-serif italic text-white"
        disabled={loading}
      />
      {loading && (
        <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-teal-300 wave-pulse">
          fetching
        </span>
      )}
    </div>
  );
}
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
  // No data source indicator — web app always uses pure-JS path (Open-Meteo + NOAA).
  // The beach-safety MCP server lives at projects/beach-safety-mcp as a separate product.
  const [favorites, setFavorites] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  // Beach image gen deferred (cost / hosting concerns). lib/image-gen.ts is dormant;
  // re-enable by restoring the useEffect + BeachImageCard mount in the JSX below.
  // const [beachImage, setBeachImage] = useState<{ url: string; cached: boolean } | null>(null);
  // const [beachImageLoading, setBeachImageLoading] = useState(false);

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
    try {
      const res = await fetch(`/api/beach?beach=${encodeURIComponent(beachName)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBeachData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch beach data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Image gen deferred — see commented-out state above. To re-enable:
  //  1. Uncomment beachImage/beachImageLoading state
  //  2. Restore the useEffect that calls /api/image-gen
  //  3. Re-add <BeachImageCard /> below the search bar
  // useEffect(() => { ... }, [beachData]);

  const isFavorite = beachData ? favorites.includes(beachData.beach_name) : false;
  const rating = useMemo(() => conditionRating(beachData?.safety_score), [beachData]);
  const today = now ? formatLocalDate(now) : "—";
  const beachShortName = beachData
    ? beachData.beach_name.split(",")[0].toUpperCase()
    : "WEST SHORE";

  return (
    <div className="relative min-h-screen md:flex">
      {/* Fixed left sidebar — vertical icon rail (hidden on mobile, drawer instead) */}
      <Sidebar />

      {/* Mobile-only fixed top bar — CSS-gated (md:hidden) so it renders immediately
         on small viewports without waiting for JS state hydration. */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-[100] px-5 pt-5 pb-3"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 70%, transparent)",
        }}
      >
        <SearchBar
          value={query}
          onChange={setQuery}
          onSearch={searchBeach}
          loading={loading}
          compact
        />
      </div>

      {/* Hero — full-bleed background image */}
      <main className="flex-1 relative min-h-screen md:overflow-hidden">
        <HeroImage />

        {/* Top bar — wordmark + date + location */}
        <TopBar
          beachLabel={beachShortName}
          date={today}
          lat={beachData?.latitude ?? null}
          lon={beachData?.longitude ?? null}
        />

        {/* Hero content — search + condition rating + summary */}
        <section className="absolute inset-0 z-10 flex flex-col justify-end pb-12 px-5 md:px-16 lg:px-24 max-w-5xl pointer-events-none">
          <div className="pointer-events-auto space-y-6 md:space-y-8">
            {/* Wordmark */}
            <div className="space-y-2 md:space-y-3">
              <p className="text-xs md:text-sm tracking-[0.35em] text-teal-300 uppercase font-mono font-semibold">
                Weather and beach report
              </p>
              <h1 className="font-serif text-5xl md:text-8xl lg:text-9xl font-black leading-[0.95] text-white tracking-tight drop-shadow-lg">
                {beachShortName}
              </h1>
            </div>

            {/* Condition rating + summary */}
            <div className="flex flex-wrap items-end gap-5 md:gap-10">
              <ConditionBadge label={rating.label} tone={rating.tone} />
              <div className="space-y-2 max-w-md">
                <p className="text-base md:text-2xl text-slate-100 font-light italic">
                  {summarizeConditions(beachData)}
                </p>
                {beachData && (
                  <p className="text-xs md:text-sm text-slate-100/90 font-mono tracking-wide">
                    {rating.detail} · rip risk {beachData.rip_current_risk} · UV {beachData.uv_index ?? "—"}
                  </p>
                )}
                {!beachData && (
                  <p className="text-xs md:text-sm text-slate-100/80 font-mono tracking-wide">
                    {rating.detail}
                  </p>
                )}
              </div>
            </div>

            {/* Search bar — desktop only (mobile has it in the top bar) */}
            <div className="hidden md:block">
              <SearchBar
                value={query}
                onChange={setQuery}
                onSearch={searchBeach}
                loading={loading}
              />
            </div>

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
    <aside className="hidden md:flex flex-col items-center justify-between w-16 lg:w-20 shrink-0 bg-slate-950/95 backdrop-blur-md border-r border-white/10 py-8 z-20">
      <div className="flex flex-col items-center gap-6">
        {items.map((it) => (
          <button
            key={it.key}
            className={`group flex flex-col items-center gap-1.5 text-xs font-mono uppercase tracking-wider transition-colors ${
              it.active ? "text-teal-300" : "text-slate-400 hover:text-slate-100"
            }`}
            title={it.label}
          >
            <span className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
              it.active
                ? "border-teal-400/60 bg-teal-400/10"
                : "border-white/10 group-hover:border-white/30"
            }`}>
              <SidebarIcon name={it.key} />
            </span>
          </button>
        ))}
      </div>
      <div className="text-[10px] font-mono text-slate-500 tracking-widest uppercase">
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
        src="/hero-hi-wide.jpg"
        alt=""
        className="w-full h-full object-cover object-center wave-pulse"
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
    <div className="absolute top-0 left-0 right-0 z-10 px-5 md:px-16 lg:px-24 pt-20 md:pt-8 flex items-start justify-between pointer-events-none">
      <div className="space-y-0.5 pointer-events-auto">
        <p className="text-xs font-mono uppercase tracking-[0.3em] text-slate-100 font-semibold">
          {beachLabel}
        </p>
        <p className="text-sm md:text-base font-mono text-slate-100">{date}</p>
      </div>
      {lat != null && lon != null && (
        <p className="text-xs font-mono uppercase tracking-[0.25em] text-slate-100 font-semibold pointer-events-auto">
          {lat.toFixed(3)}°N · {Math.abs(lon).toFixed(3)}°W
        </p>
      )}
    </div>
  );
}

function ConditionBadge({ label, tone }: { label: string; tone: "good" | "fair" | "caution" | "danger" }) {
  const colorMap = {
    good: "text-emerald-300 border-emerald-400/60",
    fair: "text-amber-300 border-amber-400/60",
    caution: "text-amber-200 border-amber-300/60",
    danger: "text-rose-300 border-rose-400/60",
  } as const;
  return (
    <div className={`inline-flex flex-col items-start gap-1.5 border-l-4 pl-5 ${colorMap[tone]}`}>
      <span className="text-xs font-mono uppercase tracking-[0.3em] font-semibold">Condition</span>
      <span className="font-serif text-5xl md:text-6xl font-black tracking-tight drop-shadow-md">{label}</span>
    </div>
  );
}



function SearchBar({
  value,
  onChange,
  onSearch,
  loading,
  compact = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: (v: string) => void;
  loading: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`border-b border-white/20 pb-2 md:pb-3 flex items-center gap-3 ${compact ? "" : "md:border-b"}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        className="w-4 h-4 md:w-5 md:h-5 text-slate-300/80 shrink-0"
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
        className={`ghost-input font-serif italic text-white placeholder:text-slate-300/60 w-full ${
          compact ? "text-base" : "text-2xl md:text-3xl"
        }`}
        disabled={loading}
        style={{ fontSize: "16px" }}
        autoComplete="off"
        enterKeyHint="search"
      />
      {loading && (
        <span className="text-[10px] md:text-xs font-mono uppercase tracking-[0.3em] text-teal-300 wave-pulse font-semibold shrink-0">
          fetching…
        </span>
      )}
      {!loading && value.trim() && (
        <button
          onClick={() => onSearch(value.trim())}
          className={`shrink-0 rounded border border-teal-400/40 hover:border-teal-300/80 text-teal-300 hover:text-teal-200 font-mono uppercase tracking-[0.25em] transition-colors ${
            compact
              ? "text-[10px] px-2 py-1"
              : "text-[10px] md:text-xs px-2 py-1 md:hidden"
          }`}
          type="button"
        >
          Search →
        </button>
      )}
    </div>
  );
}
// === BeachImageCard — DORMANT ===
// Image gen deferred (cost / hosting concerns). Component kept here so the
// re-enable is mechanical: uncomment state in Page, restore the useEffect,
// drop <BeachImageCard /> back into the JSX.
//
// function BeachImageCard({
//   imageUrl,
//   loading,
//   beachName,
//   cached,
// }: {
//   imageUrl: string | null;
//   loading: boolean;
//   beachName: string | null;
//   cached: boolean;
// }) {
//   if (!beachName) return null;
//   return (
//     <div className="pt-2 animate-[fadeIn_400ms_ease-out]">
//       <div className="flex items-center gap-3 mb-3">
//         <span className="text-xs font-mono uppercase tracking-[0.3em] text-teal-300 font-semibold">
//           Now Playing
//         </span>
//         {cached && (
//           <span className="text-[10px] font-mono uppercase tracking-widest text-slate-300/70 border border-white/10 rounded px-1.5 py-0.5">
//             cached
//           </span>
//         )}
//       </div>
//       <div className="relative w-full md:max-w-2xl aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-slate-900/60">
//         {loading && !imageUrl && (
//           <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300 wave-pulse">
//             <p className="text-xs font-mono uppercase tracking-[0.3em]">Generating scene…</p>
//           </div>
//         )}
//         {imageUrl && <img src={imageUrl} alt={`${beachName} surf scene`} className="w-full h-full object-cover" />}
//         {imageUrl && (
//           <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
//             <p className="text-xs font-mono uppercase tracking-[0.3em] text-teal-300 font-semibold">
//               {beachName.split(",")[0]}
//             </p>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

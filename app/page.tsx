"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { BeachData, HourlyForecastPoint, DailyForecastDay, SurfLabel } from "@/lib/beach-api";

const STORAGE_KEY = "wbr-favorites";
const LAST_BEACH_KEY = "wbr-last-beach";
const DEFAULT_BEACH = "Juno Pier";

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

// Abbreviated timezone name ("EST", "PDT", "JST", "UTC") for a given IANA zone.
function tzAbbrev(tz: string | undefined, date: Date = new Date()): string {
  if (!tz) return "Local";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find(p => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

// Convert an ISO-like local time string ("YYYY-MM-DD HH:MM") interpreted in `tz`
// into a human "9:14 AM" plus the tz abbrev.
function formatLocalClock(time: string, tz: string | undefined): string {
  if (!time) return "—";
  // Parse "YYYY-MM-DD HH:MM" as if it were in `tz`.
  const m = time.match(/(\d{2}):(\d{2})/);
  if (!m) return time;
  const hour = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${min} ${ampm}`;
}

function formatHourLabelWithTz(hour24: number, tz: string | undefined): string {
  const base = formatHourLabel(hour24);
  const abbrev = tzAbbrev(tz);
  // Compact: skip "ET"/"PT" duplicates when adjacent; keep terse.
  return abbrev && abbrev.length <= 4 ? `${base} ${abbrev}` : base;
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
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  // Beach image gen deferred (cost / hosting concerns). lib/image-gen.ts is dormant;
  // re-enable by restoring the useEffect + BeachImageCard mount in the JSX below.
  // const [beachImage, setBeachImage] = useState<{ url: string; cached: boolean } | null>(null);
  // const [beachImageLoading, setBeachImageLoading] = useState(false);

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

  const handleSearch = useCallback((name: string) => {
    try { localStorage.setItem(LAST_BEACH_KEY, name); } catch {}
    return searchBeach(name);
  }, [searchBeach]);

  // Toggle favorite for the currently loaded beach.
  const toggleFavorite = useCallback(() => {
    if (!beachData) return;
    setFavorites(prev => {
      const next = prev.includes(beachData.beach_name)
        ? prev.filter(n => n !== beachData.beach_name)
        : [beachData.beach_name, ...prev];
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [beachData]);

  // On mount: hydrate favorites, set the date, and auto-load the last-viewed beach
  // (or our default) so first-time visitors see a real forecast, not "Awaiting data".
  useEffect(() => {
    setNow(new Date());
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_BEACH_KEY); } catch {}
    const target = last || DEFAULT_BEACH;
    if (!last) { try { localStorage.setItem(LAST_BEACH_KEY, target); } catch {} }
    searchBeach(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update browser tab title to reflect the active beach + rating + local time.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!beachData) { document.title = "Beach Safety"; return; }
    const short = beachData.beach_name.split(",")[0];
    const rating = beachData.surf_rating?.label?.toUpperCase() ?? "—";
    const localTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: beachData.timezone,
    });
    const tz = tzAbbrev(beachData.timezone);
    document.title = `${short} — ${rating} — ${localTime} ${tz}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beachData]);

  // Image gen deferred — see commented-out state above. To re-enable:
  //  1. Uncomment beachImage/beachImageLoading state
  //  2. Restore the useEffect that calls /api/image-gen
  //  3. Re-add <BeachImageCard /> below the search bar
  // useEffect(() => { ... }, [beachData]);

  const isFavorite = beachData ? favorites.includes(beachData.beach_name) : false;
  const swimRating = useMemo(() => conditionRating(beachData?.safety_score), [beachData]);
  const surfRating = beachData?.surf_rating ?? null;
  const today = now ? formatLocalDate(now) : "—";
  const beachShortName = beachData
    ? beachData.beach_name.split(",")[0].toUpperCase()
    : "SEARCH A BEACH";

  return (
    <div className="relative min-h-screen md:flex">
      {/* Fixed left sidebar — vertical icon rail (hidden on mobile, drawer instead) */}
      <Sidebar favoritesCount={favorites.length} onOpenSaved={() => setSavedDrawerOpen(true)} />

      {/* Mobile-only fixed top bar — CSS-gated (md:hidden) so it renders immediately
         on small viewports without waiting for JS state hydration. */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-[100] px-5 pt-5 pb-3"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 70%, transparent)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchBar
              value={query}
              onChange={setQuery}
              onSearch={handleSearch}
              loading={loading}
              compact
            />
          </div>
          <button
            onClick={() => setSavedDrawerOpen(true)}
            aria-label={favorites.length > 0 ? `Saved (${favorites.length})` : "Saved beaches"}
            title={favorites.length > 0 ? `Saved (${favorites.length})` : "Saved beaches"}
            className="relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinejoin="round" />
            </svg>
            {favorites.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-400 text-slate-950 text-[10px] font-bold flex items-center justify-center px-1 font-mono">
                {favorites.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Hero — full-bleed background image */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="relative h-[78vh] min-h-[520px] md:h-screen md:overflow-hidden shrink-0">
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

            {/* Surf rating (primary) + swim-safety rating (secondary) + summary */}
            <div className="flex flex-wrap items-end gap-5 md:gap-8">
              <ConditionBadge
                kicker="Surf"
                label={surfRating?.label ?? "—"}
                tone={surfRating?.tone ?? "fair"}
                size="lg"
              />
              <ConditionBadge
                kicker="Swim"
                label={swimRating.label}
                tone={swimRating.tone}
                size="sm"
              />
              {beachData && (
                <button
                  onClick={toggleFavorite}
                  aria-label={isFavorite ? "Remove from saved" : "Save beach"}
                  title={isFavorite ? "Remove from saved" : "Save beach"}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono uppercase tracking-wider transition-colors ${
                    isFavorite
                      ? "bg-rose-400/20 border-rose-400/60 text-rose-200 hover:bg-rose-400/30"
                      : "bg-white/5 border-white/15 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinejoin="round" />
                  </svg>
                  <span>{isFavorite ? "Saved" : "Save"}</span>
                </button>
              )}
              <div className="space-y-2 max-w-md">
                <p className="text-base md:text-2xl text-slate-100 font-light italic">
                  {summarizeConditions(beachData)}
                </p>
                {beachData && (
                  <p className="text-xs md:text-sm text-slate-100/90 font-mono tracking-wide flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{surfRating?.reason && surfRating.reason !== "—" ? surfRating.reason : (surfRating?.summary ?? swimRating.detail)}</span>
                    <span className="text-slate-500">·</span>
                    <span>rip risk {beachData.rip_current_risk}</span>
                    {beachData.tide?.available && beachData.tide.currentHeightFt != null && (
                      <>
                        <span className="text-slate-500">·</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="text-cyan-300/90">tide</span>
                          <span>{beachData.tide.currentHeightFt.toFixed(1)}ft</span>
                          {beachData.tide.trend && beachData.tide.trend !== "unknown" && (
                            <span className="text-slate-400">
                              {beachData.tide.trend === "rising" ? "rising" :
                                beachData.tide.trend === "falling" ? "falling" :
                                beachData.tide.trend === "high" ? "high slack" : "low slack"}
                            </span>
                          )}
                          {beachData.tide.nextHigh && (
                            <span className="text-slate-400">
                              · next high {formatTideTime(beachData.tide.nextHigh.time)} {tzAbbrev(beachData.timezone)} ({beachData.tide.nextHigh.heightFt.toFixed(1)}ft)
                            </span>
                          )}
                        </span>
                      </>
                    )}
                    <span className="text-slate-500">·</span>
                    <span>UV {beachData.uv_index ?? "—"}</span>
                  </p>
                )}
                {!beachData && (
                  <p className="text-xs md:text-sm text-slate-100/80 font-mono tracking-wide">
                    {swimRating.detail}
                  </p>
                )}
              </div>
            </div>

            {/* Search bar — desktop only (mobile has it in the top bar) */}
            <div className="hidden md:block">
              <SearchBar
                value={query}
                onChange={setQuery}
                onSearch={handleSearch}
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

      {/* Saved beaches drawer */}
      {savedDrawerOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-stretch md:items-center md:justify-center"
          onClick={() => setSavedDrawerOpen(false)}
        >
          <div
            className="w-full md:max-w-md md:mx-4 bg-slate-950 border-t md:border border-white/10 md:rounded-xl p-5 md:p-6 space-y-4 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-teal-300 font-semibold">
                  Saved
                </p>
                <h3 className="font-serif text-2xl font-black tracking-tight">
                  {favorites.length === 0 ? "Nothing saved yet" : `${favorites.length} beach${favorites.length === 1 ? "" : "es"}`}
                </h3>
              </div>
              <button
                onClick={() => setSavedDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-100 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {favorites.length === 0 ? (
              <p className="text-sm text-slate-400 font-light italic">
                Tap <span className="not-italic font-mono text-slate-200">Save</span> on any beach to add it here.
              </p>
            ) : (
              <ul className="space-y-2">
                {favorites.map((name) => {
                  const isCurrent = beachData?.beach_name === name;
                  return (
                    <li key={name}>
                      <button
                        onClick={() => { handleSearch(name); setSavedDrawerOpen(false); }}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isCurrent
                            ? "border-teal-400/40 bg-teal-400/[0.06]"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-serif text-base font-bold tracking-tight">
                            {name.split(",")[0]}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-teal-400">
                              NOW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">{name}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Forecast sections — hourly + 7-day, scroll below hero */}
      <ForecastSection
        hourly={beachData?.hourly ?? []}
        daily={beachData?.daily ?? []}
        loaded={beachData != null}
        tz={beachData?.timezone}
      />
      </div>
    </div>
  );
}

function Sidebar({ favoritesCount, onOpenSaved }: { favoritesCount: number; onOpenSaved: () => void }) {
  return (
    <aside className="hidden md:flex flex-col items-center justify-between w-16 lg:w-20 shrink-0 bg-slate-950/95 backdrop-blur-md border-r border-white/10 py-8 z-20">
      <div className="flex flex-col items-center gap-6">
        {/* Surf (current view) */}
        <button
          className="group flex flex-col items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-teal-300 transition-colors"
          title="Surf"
        >
          <span className="w-10 h-10 rounded-full flex items-center justify-center border border-teal-400/60 bg-teal-400/10 transition-colors">
            <SidebarIcon name="surf" />
          </span>
        </button>

        {/* Saved beaches — opens a drawer with all favorites */}
        <button
          onClick={onOpenSaved}
          className="group flex flex-col items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-slate-400 hover:text-slate-100 transition-colors relative"
          title={favoritesCount > 0 ? `Saved (${favoritesCount})` : "No saved beaches yet"}
        >
          <span className="w-10 h-10 rounded-full flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors">
            <SidebarIcon name="saved" />
          </span>
          {favoritesCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-rose-400 text-slate-950 text-[10px] font-bold flex items-center justify-center px-1 font-mono">
              {favoritesCount}
            </span>
          )}
        </button>
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
    case "saved":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={common}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" strokeLinejoin="round" />
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

function ConditionBadge({
  kicker,
  label,
  tone,
  size = "lg",
}: {
  kicker: string;
  label: string;
  tone: "good" | "fair" | "caution" | "danger";
  size?: "lg" | "sm";
}) {
  const colorMap = {
    good: "text-emerald-300 border-emerald-400/60",
    fair: "text-amber-300 border-amber-400/60",
    caution: "text-amber-200 border-amber-300/60",
    danger: "text-rose-300 border-rose-400/60",
  } as const;
  const labelClass =
    size === "lg"
      ? "font-serif text-5xl md:text-6xl font-black tracking-tight drop-shadow-md"
      : "font-serif text-2xl md:text-3xl font-bold tracking-tight drop-shadow-md";
  const kickerClass =
    size === "lg"
      ? "text-xs font-mono uppercase tracking-[0.3em] font-semibold"
      : "text-[10px] font-mono uppercase tracking-[0.25em] font-semibold";
  return (
    <div className={`inline-flex flex-col items-start gap-1.5 border-l-4 pl-5 ${colorMap[tone]}`}>
      <span className={kickerClass}>{kicker}</span>
      <span className={labelClass}>{label}</span>
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

// ─── Forecast Section: hourly + 7-day ─────────────────────────────────────

const ratingToneText: Record<SurfLabel, string> = {
  EPIC: "text-emerald-300",
  GOOD: "text-emerald-300",
  FAIR: "text-amber-300",
  SMALL: "text-amber-200",
  FLAT: "text-rose-300",
};

const ratingDot: Record<SurfLabel, string> = {
  EPIC: "bg-emerald-300",
  GOOD: "bg-emerald-400",
  FAIR: "bg-amber-300",
  SMALL: "bg-amber-200",
  FLAT: "bg-rose-400",
};

function parseHourFromIso(t: string): number {
  // Open-Meteo returns "YYYY-MM-DDTHH:MM" in the requested timezone.
  return parseInt(t.slice(11, 13), 10);
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12A";
  if (h === 12) return "12P";
  if (h < 12) return `${h}A`;
  return `${h - 12}P`;
}

function formatTideTime(t: string): string {
  // NOAA returns "YYYY-MM-DD HH:MM" in LST/LDT. Show as "7:42 AM".
  if (!t) return "—";
  const m = t.match(/(\d{2}):(\d{2})/);
  if (!m) return t;
  const hh = parseInt(m[1], 10);
  const mm = m[2];
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return `${h12}:${mm} ${period}`;
}

function findBestWindow(todayHours: HourlyForecastPoint[]): { startHour: number; endHour: number; avgScore: number } | null {
  // Best contiguous run of FAIR-or-better (score >= 5) within the day.
  let best: { startHour: number; endHour: number; avgScore: number } | null = null;
  let runStart: number | null = null;
  let runScores: number[] = [];
  for (const h of todayHours) {
    if (h.surfRating.score >= 5) {
      if (runStart === null) {
        runStart = h.hour;
        runScores = [];
      }
      runScores.push(h.surfRating.score);
    } else if (runStart !== null) {
      const endHour = h.hour;
      const avg = runScores.reduce((a, b) => a + b, 0) / runScores.length;
      const candidate = { startHour: runStart, endHour, avgScore: avg };
      if (!best || candidate.endHour - candidate.startHour > (best.endHour - best.startHour)) {
        best = candidate;
      }
      runStart = null;
      runScores = [];
    }
  }
  // Tail run
  if (runStart !== null && todayHours.length > 0) {
    const last = todayHours[todayHours.length - 1].hour + 1;
    const avg = runScores.reduce((a, b) => a + b, 0) / runScores.length;
    const candidate = { startHour: runStart, endHour: last, avgScore: avg };
    if (!best || candidate.endHour - candidate.startHour > (best.endHour - best.startHour)) {
      best = candidate;
    }
  }
  return best;
}

function ForecastSection({
  hourly,
  daily,
  loaded,
  tz,
}: {
  hourly: HourlyForecastPoint[];
  daily: DailyForecastDay[];
  loaded: boolean;
  tz?: string;
}) {
  // Today = first 24 hours of the 168-hour series.
  const todayHours = hourly.slice(0, 24);
  const currentHour = new Date().getHours();
  const sunriseHour = daily[0]?.sunrise ? parseHourFromIso(daily[0].sunrise) : null;
  const sunsetHour = daily[0]?.sunset ? parseHourFromIso(daily[0].sunset) : null;
  const bestWindow = todayHours.length > 0 ? findBestWindow(todayHours) : null;

  if (!loaded) return null;

  return (
    <section
      className="relative bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 px-5 md:px-16 lg:px-24 py-12 md:py-20 space-y-14"
    >
      {/* Subtle top accent line for visual separation from hero */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/30 to-transparent" />

      <HourlyTimeline
        todayHours={todayHours}
        currentHour={currentHour}
        sunriseHour={sunriseHour}
        sunsetHour={sunsetHour}
        bestWindow={bestWindow}
        tz={tz}
      />

      <DailyForecastRow daily={daily} tz={tz} />
    </section>
  );
}

function HourlyTimeline({
  todayHours,
  currentHour,
  sunriseHour,
  sunsetHour,
  bestWindow,
  tz,
}: {
  todayHours: HourlyForecastPoint[];
  currentHour: number;
  sunriseHour: number | null;
  sunsetHour: number | null;
  bestWindow: { startHour: number; endHour: number; avgScore: number } | null;
  tz?: string;
}) {
  if (todayHours.length === 0) return null;

  // Build best-window lookup: { hour -> avgScore }
  const inWindow = new Set<number>();
  if (bestWindow) {
    for (let h = bestWindow.startHour; h < bestWindow.endHour; h++) inWindow.add(h);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-teal-300 font-semibold">
            Today
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-black tracking-tight">
            Next 24 hours
          </h2>
        </div>
        <div className="text-right space-y-0.5">
          {bestWindow ? (
            <>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-emerald-300 font-semibold">
                Best window
              </p>
              <p className="text-sm md:text-base font-mono">
                {formatHourLabel(bestWindow.startHour)}–{formatHourLabel(bestWindow.endHour)}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-400 font-semibold">
                Today
              </p>
              <p className="text-sm md:text-base font-mono text-slate-400">No rideable window</p>
            </>
          )}
        </div>
      </div>

      {/* Scrollable strip with right-edge fade affordance (mobile only) */}
      <div className="relative md:mx-0">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-950 to-transparent z-10 md:hidden" />
        <div className="overflow-x-auto scrollbar-hide md:mx-0 md:px-0 md:overflow-visible">
        <div className="relative inline-flex items-stretch gap-0">
          {todayHours.map((h, i) => {
            const isCurrent = h.hour === currentHour;
            const isBest = inWindow.has(h.hour);
            return (
              <div
                key={i}
                className={`
                  relative flex flex-col items-center justify-between
                  w-[44px] md:w-[56px] shrink-0 py-3 px-1
                  border-r border-white/5 last:border-r-0
                  ${isCurrent ? "bg-white/[0.04]" : ""}
                `}
              >
                {/* Sunrise / sunset markers — fixed-height row so all cells stay aligned */}
                <div className="h-3 flex items-start justify-center text-[9px] leading-none">
                  {sunriseHour === h.hour && <span className="text-amber-300/80">☀</span>}
                  {sunsetHour === h.hour && <span className="text-orange-300/80">☾</span>}
                </div>

                {/* Hour label */}
                <span className={`text-[10px] font-mono uppercase tracking-wider ${isCurrent ? "text-white font-semibold" : "text-slate-400"}`}>
                  {formatHourLabel(h.hour)}
                </span>

                {/* Wave height — serif */}
                <span className={`font-serif text-lg md:text-xl font-bold leading-none tabular-nums ${ratingToneText[h.surfRating.label]}`}>
                  {h.waveHeightFt.toFixed(1)}
                </span>

                {/* Rating dot */}
                <div className={`w-2 h-2 rounded-full ${ratingDot[h.surfRating.label]} ${isBest ? "ring-2 ring-emerald-300/40 ring-offset-1 ring-offset-slate-950" : ""}`} />

                {/* Current-hour ring (drawn around the whole cell) */}
                {isCurrent && (
                  <div className="absolute inset-1 border border-white/60 rounded pointer-events-none" />
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
        {(["EPIC", "GOOD", "FAIR", "SMALL", "FLAT"] as SurfLabel[]).map((label) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ratingDot[label]}`} />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">{label}</span>
          </div>
        ))}
        {bestWindow && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-300 ring-2 ring-emerald-300/40 ring-offset-1 ring-offset-slate-950" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-300">best window</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DailyForecastRow({ daily, tz }: { daily: DailyForecastDay[]; tz?: string }) {
  if (daily.length === 0) return null;

  // Find best day by rating score (first day wins ties so today wins if it ties)
  let bestScore = -1;
  for (const d of daily) if (d.bestRating.score > bestScore) bestScore = d.bestRating.score;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-3">
        <div className="space-y-1">
          <p className="text-[10px] font-mono uppercase tracking-[0.35em] text-teal-300 font-semibold">
            Outlook
          </p>
          <h2 className="font-serif text-3xl md:text-4xl font-black tracking-tight">
            Next 7 days
          </h2>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-slate-400 font-semibold">
            Updated
          </p>
          <p className="text-sm md:text-base font-mono text-slate-400">
            {tz
              ? `${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz })} ${tzAbbrev(tz)}`
              : new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </p>
        </div>
      </div>

      <div className="relative md:mx-0">
        {/* Mobile: vertical list (no horizontal scroll needed).
            Desktop: 7-column card grid. */}
        <div className="md:hidden flex flex-col gap-2">
          {daily.map((d, i) => {
            const isToday = i === 0;
            const isBestDay = d.bestRating.score === bestScore && d.bestRating.score > 0;
            return (
              <div
                key={d.date}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg border
                  ${isBestDay
                    ? "border-emerald-400/40 bg-emerald-400/[0.04]"
                    : "border-white/10 bg-white/[0.02]"}
                  ${isToday ? "ring-1 ring-teal-400/40" : ""}
                `}
              >
                <div className="flex-shrink-0 w-12 text-left">
                  <div className="text-[11px] font-mono uppercase tracking-[0.15em] text-slate-200 font-semibold leading-tight">
                    {d.dayName}
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 leading-tight">
                    {d.dayDate}
                  </div>
                  {isToday && (
                    <div className="text-[8px] font-mono uppercase tracking-wider font-bold text-teal-400 mt-0.5">
                      NOW
                    </div>
                  )}
                </div>
                <div className={`flex-shrink-0 font-serif text-2xl font-black tracking-tight ${ratingToneText[d.bestRating.label]}`}>
                  {d.bestRating.label}
                </div>
                <div className="flex-1 min-w-0 text-right space-y-0.5">
                  <div className="text-sm font-serif font-bold tabular-nums text-slate-100">
                    {d.waveMaxFt.toFixed(1)}ft
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 leading-tight" title={d.bestRating.reason}>
                    {(() => {
                      const r = d.bestRating.reason;
                      const modIdx = r.indexOf("·");
                      if (modIdx === -1) return r;
                      const main = r.slice(0, modIdx).trim();
                      const mod = r.slice(modIdx + 1).trim();
                      return (
                        <>
                          <span className="text-slate-300">{main}</span>
                          <span className="text-slate-500"> · </span>
                          <span className="text-amber-300/70">{mod}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-0.5 pl-2 border-l border-white/10">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-mono uppercase text-slate-500">uv</span>
                    <span className="text-xs font-mono tabular-nums text-slate-300">
                      {d.uvMax.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[8px] font-mono uppercase text-slate-500">rain</span>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {d.rainProbPct}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: 7-column card grid */}
        <div className="hidden md:block">
          <div className="grid grid-cols-7 gap-3">
            {daily.map((d, i) => {
              const isToday = i === 0;
              const isBestDay = d.bestRating.score === bestScore && d.bestRating.score > 0;
              return (
                <div
                  key={d.date}
                  className={`
                    relative flex flex-col items-stretch gap-1.5
                    px-3 py-4 rounded-lg border
                    ${isBestDay
                      ? "border-emerald-400/40 bg-emerald-400/[0.04]"
                      : "border-white/10 bg-white/[0.02]"}
                    ${isToday ? "ring-1 ring-teal-400/40" : ""}
                  `}
                >
                  <div className="flex items-baseline justify-between gap-1 min-h-[14px]">
                    <span className="text-xs font-mono uppercase tracking-[0.15em] text-slate-300 font-semibold">
                      {d.dayName}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 -mt-1">
                    {d.dayDate}
                  </span>
                  <span className={`font-serif text-2xl font-black tracking-tight whitespace-nowrap ${ratingToneText[d.bestRating.label]}`}>
                    {d.bestRating.label}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 -mt-0.5 leading-tight" title={d.bestRating.reason}>
                    {(() => {
                      const r = d.bestRating.reason;
                      const modIdx = r.indexOf("·");
                      if (modIdx === -1) return <span className="text-slate-300">{r}</span>;
                      return (
                        <>
                          <span className="text-slate-300">{r.slice(0, modIdx).trim()}</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-amber-300/70">{r.slice(modIdx + 1).trim()}</span>
                        </>
                      );
                    })()}
                  </span>
                  <div className="space-y-0.5 pt-1 mt-auto">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] font-mono uppercase text-slate-500">wave</span>
                      <span className="text-sm font-serif font-bold tabular-nums text-slate-200">
                        {d.waveMaxFt.toFixed(1)}ft
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] font-mono uppercase text-slate-500">uv</span>
                      <span className="text-sm font-mono tabular-nums text-slate-300">
                        {d.uvMax.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[9px] font-mono uppercase text-slate-500">rain</span>
                      <span className="text-sm font-mono tabular-nums text-slate-400">
                        {d.rainProbPct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

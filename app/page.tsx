"use client";

import { useState, useEffect, useCallback } from "react";
import BeachSearch from "@/components/BeachSearch";
import BeachCard from "@/components/BeachCard";
import type { BeachData } from "@/lib/beach-api";
import Link from "next/link";
import { Anchor, Sparkles } from "lucide-react";

const STORAGE_KEY = "beach-safety-favorites";

export default function Page() {
  const [query, setQuery] = useState("");
  const [beachData, setBeachData] = useState<BeachData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Load favorites from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  const saveFavorites = useCallback((favs: string[]) => {
    setFavorites(favs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  }, []);

  const searchBeach = useCallback(
    async (beachName: string) => {
      setLoading(true);
      setError(null);
      setBeachData(null);

      try {
        const res = await fetch(`/api/beach?beach=${encodeURIComponent(beachName)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: BeachData = await res.json();
        if (data.error) throw new Error(data.error);
        setBeachData(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch beach data");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const toggleFavorite = useCallback(() => {
    if (!beachData) return;
    const name = beachData.beach_name;
    const isFav = favorites.includes(name);
    if (isFav) {
      saveFavorites(favorites.filter((f) => f !== name));
    } else {
      saveFavorites([...favorites, name]);
    }
  }, [beachData, favorites, saveFavorites]);

  const removeFavorite = useCallback(
    (name: string) => {
      saveFavorites(favorites.filter((f) => f !== name));
    },
    [favorites, saveFavorites]
  );

  const isFavorite = beachData ? favorites.includes(beachData.beach_name) : false;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-ocean-800 flex flex-col">
      {/* Subtle background texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, #22d3ee 0%, transparent 50%), radial-gradient(circle at 80% 20%, #06b6d4 0%, transparent 40%)",
        }}
      />

      <div className="relative z-10 w-full max-w-2xl mx-auto px-4 py-12 flex flex-col gap-8">
        {/* Header */}
        <header className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Anchor size={28} className="text-cyan-400" />
            <h1 className="text-3xl font-bold text-slate-100 tracking-tight">
              Beach Conditions
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Real-time safety data for beaches worldwide
          </p>
          <div className="pt-2">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-400/10 hover:bg-cyan-400/20 border border-cyan-400/20 rounded-full px-3 py-1 transition-colors"
            >
              <Sparkles size={12} />
              BeachCast Pro — $5/mo
            </Link>
          </div>
        </header>

        {/* Search */}
        <BeachSearch
          value={query}
          onChange={setQuery}
          onSearch={searchBeach}
          favorites={favorites}
          onFavoriteClick={searchBeach}
          onRemoveFavorite={removeFavorite}
          loading={loading}
        />

        {/* Results */}
        <div className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          {beachData && !error && (
            <BeachCard
              data={beachData}
              isFavorite={isFavorite}
              onToggleFavorite={toggleFavorite}
            />
          )}

          {!beachData && !loading && !error && (
            <EmptyState />
          )}
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#64748b"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </div>
      <div>
        <p className="text-slate-300 font-medium">Search for any beach</p>
        <p className="text-slate-500 text-sm mt-1">
          Try &ldquo;Waikiki&rdquo;, &ldquo;Bondi Beach&rdquo;, or &ldquo;South Beach, Miami&rdquo;
        </p>
      </div>
    </div>
  );
}

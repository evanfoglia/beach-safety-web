"use client";

import { Search } from "lucide-react";
import FavoriteChip from "./FavoriteChip";

interface BeachSearchProps {
  value: string;
  onChange: (val: string) => void;
  onSearch: (beach: string) => void;
  favorites: string[];
  onFavoriteClick: (beach: string) => void;
  onRemoveFavorite: (beach: string) => void;
  loading: boolean;
}

export default function BeachSearch({
  value,
  onChange,
  onSearch,
  favorites,
  onFavoriteClick,
  onRemoveFavorite,
  loading,
}: BeachSearchProps) {
  return (
    <div className="w-full space-y-3">
      <div className="relative">
        <Search
          size={20}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) {
              onSearch(value.trim());
            }
          }}
          placeholder='Search any beach — e.g. "Waikiki", "Bondi Beach", "South Beach, Miami"'
          className="w-full pl-12 pr-4 py-4 bg-slate-800/80 border border-slate-700/80 rounded-2xl text-slate-100 placeholder-slate-500 text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/60 focus:border-cyan-500/60 transition-all font-sans"
          disabled={loading}
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {favorites.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pl-1">
          <span className="text-xs text-slate-500 uppercase tracking-widest font-mono">
            ★ Favorites
          </span>
          {favorites.map((fav) => (
            <FavoriteChip
              key={fav}
              name={fav}
              onClick={() => onFavoriteClick(fav)}
              onRemove={() => onRemoveFavorite(fav)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

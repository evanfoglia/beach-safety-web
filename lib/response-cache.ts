/**
 * Tiny in-memory LRU + TTL cache for beach API responses.
 *
 * Open-Meteo/NOAA data is per-hour granularity, so a 10-minute TTL is fresh
 * for surf decisions while collapsing repeat-traffic for popular beaches
 * (e.g. "Juno Pier" → 1 upstream call per 10 min, not per request).
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const MAX_ENTRIES = 1000;

export function createTtlCache<T>(defaultTtlMs: number) {
  // Plain Map preserves insertion order, perfect for LRU eviction.
  const store = new Map<string, Entry<T>>();

  function get(key: string): T | undefined {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return undefined;
    }
    // Touch — reinsert to move to most-recently-used end.
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }

  function set(key: string, value: T, ttlMs: number = defaultTtlMs): void {
    if (store.has(key)) store.delete(key);
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    // Evict oldest until under cap.
    while (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  function size(): number {
    return store.size;
  }

  function clear(): void {
    store.clear();
  }

  return { get, set, size, clear };
}

// --- singleton cache for /api/beach responses ---
export const beachResponseCache = createTtlCache<unknown>(10 * 60_000); // 10 min

// --- singleton cache for Nominatim geocode lookups ---
export const geocodeCache = createTtlCache<unknown>(7 * 24 * 60 * 60_000); // 7 days

// Normalize a beach name for cache key purposes. Lowercase + collapse whitespace.
export function normalizeBeachKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Long-TTL cache for Pexels image URL lookups.
 *
 * Pexels CDN URLs are stable indefinitely, so a hit is cached for 30 days.
 * Negative results (no matching photo) are cached for a shorter TTL so we
 * don't hammer Pexels for repeat misses, but re-check later in case their
 * catalog grows.
 */

import { createTtlCache } from "./response-cache";

const HIT_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days
const MISS_TTL_MS = 24 * 60 * 60_000; // 1 day

// Pexels photo CDN URLs last essentially forever (https://images.pexels.com/...).
// Empty string is a sentinel for "no match" so we don't hammer on repeat misses.
// null/undefined means "not cached yet".
export const pexelsImageCache = createTtlCache<string>(HIT_TTL_MS);

export function pexelsCacheImageUrl(key: string, url: string): void {
  pexelsImageCache.set(key, url, HIT_TTL_MS);
}

export function pexelsCacheMiss(key: string): void {
  // Empty string = "we already asked Pexels and got nothing back".
  pexelsImageCache.set(key, "", MISS_TTL_MS);
}

/**
 * Long-TTL cache for Wikimedia Commons image URL lookups.
 *
 * Wikimedia upload URLs (upload.wikimedia.org) are stable indefinitely, so we
 * cache hits for 30 days. Misses (no matching photo) are cached for a shorter
 * TTL so we don't hammer on repeat misses, but re-check later in case the
 * catalog grows.
 */

import { createTtlCache } from "./response-cache";

const HIT_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days
const MISS_TTL_MS = 24 * 60 * 60_000; // 1 day

// Wikimedia upload URLs are stable: https://upload.wikimedia.org/wikipedia/commons/...
// Empty string is a sentinel for "no match" so repeat misses don't re-call the API.
export const wikimediaImageCache = createTtlCache<string>(HIT_TTL_MS);

export function wikiCacheHit(key: string, url: string): void {
  wikimediaImageCache.set(key, url, HIT_TTL_MS);
}

export function wikiCacheMiss(key: string): void {
  wikimediaImageCache.set(key, "", MISS_TTL_MS);
}

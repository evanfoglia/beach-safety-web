/**
 * Sliding-window IP rate limiter.
 *
 * In-memory, single-process. Adequate for a Next.js `npm run start` server
 * behind a Cloudflare tunnel — limits abuse without infra.
 *
 * Returns the *number of milliseconds* until the client may retry, or `null`
 * if the request is allowed.
 */

interface Bucket {
  // Timestamps of recent hits (most-recent first). Trimmed on every check.
  hits: number[];
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_HITS = 30; // per IP per WINDOW_MS

const buckets = new Map<string, Bucket>();

export function getClientIp(request: Request): string {
  // Trust common proxy headers. The tunnel is Cloudflare, so cf-connecting-ip
  // is the right source — fall back to x-forwarded-for then x-real-ip.
  const headers = request.headers;
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export function checkRateLimit(ip: string, now: number = Date.now()): number | null {
  const bucket = buckets.get(ip) ?? { hits: [] };
  // Trim anything outside the window.
  const cutoff = now - WINDOW_MS;
  while (bucket.hits.length > 0 && bucket.hits[0] < cutoff) bucket.hits.shift();
  if (bucket.hits.length >= MAX_HITS) {
    // Retry after the oldest hit ages out of the window.
    const retryAfterMs = bucket.hits[0] + WINDOW_MS - now;
    buckets.set(ip, bucket);
    return Math.max(0, retryAfterMs);
  }
  bucket.hits.unshift(now);
  buckets.set(ip, bucket);
  return null;
}

// Periodic sweep so abandoned buckets don't leak memory forever.
const SWEEP_MS = 5 * 60_000; // 5 min
const TTL_MS = 30 * 60_000; // idle TTL = 30 min

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cutoff = Date.now() - TTL_MS;
    for (const [ip, bucket] of buckets) {
      // Drop buckets with no activity for TTL_MS.
      if (bucket.hits.length === 0 || bucket.hits[0] < cutoff) buckets.delete(ip);
    }
  }, SWEEP_MS).unref?.();
}

export const RATE_LIMIT_CONFIG = {
  windowMs: WINDOW_MS,
  maxHits: MAX_HITS,
};

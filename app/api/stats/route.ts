/**
 * Lightweight stats endpoint for surf-side observability.
 *
 * Exposes in-process counters. The response cache is the most useful one:
 * each cached beach name represents at least one user request for it. So
 * `cachedBeaches.count` ≈ distinct beaches searched by users since process
 * start (some of which may be from my own testing). Pages also count since
 * each /api/beach call hits this code path.
 *
 * No PII, no per-IP reporting. Cheap and authoritative since we own the
 * process and the cache.
 */

import { NextResponse } from "next/server";
import { beachResponseCache, geocodeCache } from "@/lib/response-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    cachedBeaches: {
      count: (beachResponseCache as unknown as { size(): number }).size(),
    },
    cachedGeocodes: {
      count: (geocodeCache as unknown as { size(): number }).size(),
    },
    timestamp: new Date().toISOString(),
    processUptimeSeconds: Math.round(process.uptime()),
  });
}

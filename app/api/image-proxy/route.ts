/**
 * Hero image proxy — Pexels search with caching + static fallback.
 *
 * For each beach name we ask Pexels for one landscape photo. CDN URLs are
 * stable, so we cache hits for 30 days and misses for 1 day. If no match
 * is found (or the PEXELS_API_KEY env var is missing), the route returns
 * the local fallback hero path so the client can render something.
 *
 * Rate limit: Pexels free tier is 200 req/hr, 20k req/mo. With our cache,
 * one Pexels call per unique beach forever (within 30 days), so even a
 * successful launch won't come close to the cap.
 */

import { NextRequest, NextResponse } from "next/server";
import { normalizeBeachKey } from "@/lib/response-cache";
import { pexelsImageCache, pexelsCacheImageUrl, pexelsCacheMiss } from "@/lib/pexels-cache";

export const dynamic = "force-dynamic";

const FALLBACK_URL = "/hero-hi-wide.jpg";

interface PexelsPhoto {
  src: {
    landscape?: string;
    large?: string;
    medium?: string;
    original?: string;
  };
}

interface PexelsResponse {
  photos?: PexelsPhoto[];
}

function pickBestPhoto(photo: PexelsPhoto | undefined): string | null {
  if (!photo?.src) return null;
  return photo.src.landscape ?? photo.src.large ?? photo.src.medium ?? photo.src.original ?? null;
}

async function fetchPexelsPhoto(query: string, apiKey: string): Promise<string | null> {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: apiKey },
    // Pexels sometimes slow; cap at 5s so a slow upstream doesn't stall the page.
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as PexelsResponse;
  const first = data?.photos?.[0];
  return pickBestPhoto(first);
}

export async function GET(request: NextRequest) {
  const beachName = (new URL(request.url).searchParams.get("beach") || "").trim();
  if (!beachName) {
    return NextResponse.json({ url: FALLBACK_URL, source: "fallback" });
  }

  const key = normalizeBeachKey(beachName);
  const cached = pexelsImageCache.get(key);
  if (cached !== undefined) {
    // Cached hit or sentinel for miss.
    const url = cached === "" ? FALLBACK_URL : cached;
    return NextResponse.json({ url, source: cached === "" ? "cached-miss" : "cache" });
  }

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    pexelsCacheMiss(key);
    return NextResponse.json({ url: FALLBACK_URL, source: "no-api-key" });
  }

  try {
    const photoUrl = await fetchPexelsPhoto(`${beachName} beach`, apiKey);
    if (photoUrl) {
      pexelsCacheImageUrl(key, photoUrl);
      return NextResponse.json({ url: photoUrl, source: "pexels" });
    }
    pexelsCacheMiss(key);
    return NextResponse.json({ url: FALLBACK_URL, source: "no-match" });
  } catch {
    pexelsCacheMiss(key);
    return NextResponse.json({ url: FALLBACK_URL, source: "error" });
  }
}

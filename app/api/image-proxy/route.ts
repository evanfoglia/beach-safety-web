/**
 * Hero image proxy — Wikimedia Commons search with caching + static fallback.
 *
 * For each beach we ask Commons for photo candidates and pick the most
 * beach-relevant title. Upload URLs (upload.wikimedia.org) are stable, so
 * we cache hits for 30 days. If no candidate is beach-relevant (or the
 * lookup errors), the route returns the local /hero-hi-wide.jpg.
 *
 * Why Wikimedia Commons and not Pexels/AI-gen:
 *   - Free, no signup, no API key, no env var to leak
 *   - Public-domain licensing for most photos
 *   - Wikimedia's API requires an identifiable User-Agent (we set one)
 *   - With our 30-day cache, even thousands of distinct beaches stay
 *     well under Wikimedia's rate limits
 *
 * Algorithm (geosearch when coords are provided, fall back to text search):
 *   1. If lat/lon is given: fetch File-namespace items within 5 km radius
 *   2. Else: do a text search against the beach name
 *   3. Filter the candidate set to image URLs (.jpg / .jpeg / .png / .webp,
 *      MIME starts with "image/", no PDF-as-image artifacts)
 *   4. Score each title: coast/beach terms add points, off-topic hints
 *      (insect, voyage, civil, etc) subtract points. Pick the highest scorer.
 *   5. If the best candidate's score isn't positive, fall back to
 *      /hero-hi-wide.jpg — Wikimedia's photo coverage is uneven, and a
 *      generic bee photo is worse for a hero image than the surf hero.
 */

import { NextRequest, NextResponse } from "next/server";
import { normalizeBeachKey } from "@/lib/response-cache";
import { wikimediaImageCache, wikiCacheHit, wikiCacheMiss } from "@/lib/wikimedia-cache";

export const dynamic = "force-dynamic";

const FALLBACK_URL = "/hero-hi-wide.jpg";
const USER_AGENT = "BeachSafetyWeb/1.0 (contact@beachconditions.app)";
const COMMON_HEADERS = { "User-Agent": USER_AGENT };
const GEOSEARCH_RADIUS_M = 10000;
const SEARCH_HIT_LIMIT = 15;

// Strict trailing-extension check so we don't accept PDF page-1 thumbnails
// that Wikimedia emits as `.pdf.jpg`. Combined with MIME- and path-based
// guards below.
const IMAGE_EXT_RE = /\.(?:jpg|jpeg|png|webp)(\?.*)?$/i;

// Title tokens that suggest "this is a beach/coast image". Specific surf
// landmarks (Pipeline, Banzai) and well-known coast adjectives (Diamond,
// sunset) help when Wikimedia tagged photos at the city level rather than
// the exact beach lat/lon.
const COAST_TERMS = [
  "beach", "surf", "pier", "shore", "wave", "lighthouse", "coast",
  "break", "bay", "lagoon", "ocean", "reef", "cove", "harbor",
  "diamond", "head", "sunset", "hawaii", "pipeline", "banzai",
];

// Title tokens that suggest "this is NOT a beach photo". Architecture
// (building/hotel/galleria) and street events (parade/festival) are common
// false positives for beach coordinates inside a city; insects, plants,
// historical documents, and named ships are noise from full-text search.
const NON_SURF_HINTS = [
  "insect", "bee", "beetle", "butterfly", "moth", "lupine",
  "bean", "potato", "war", "civil", "voyage", "harriet",
  "queen", "empress", "victoria", "novel",
  "building", "plaza", "hotel", "galleria",
  "festival", "parade",
];

interface MwImageInfo {
  url?: string;
  mime?: string;
}

interface MwSearchPage {
  pageid: number;
  title: string;
  imageinfo?: MwImageInfo[];
}

async function mwGet<T>(params: Record<string, string>): Promise<T | null> {
  const search = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${search}`, {
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function isHeroCandidateUrl(url: string, mime: string | undefined): boolean {
  if (mime && !mime.startsWith("image/")) return false;
  if (url.includes("/thumb/") && url.includes(".pdf")) return false;
  if (url.toLowerCase().includes(".pdf")) return false;
  return IMAGE_EXT_RE.test(url);
}

function relevanceScore(title: string, beachTerms: string[]): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const term of COAST_TERMS) if (t.includes(term)) score += 3;
  for (const hint of NON_SURF_HINTS) if (t.includes(hint)) score -= 4;
  // Specific terms (≥4 chars, not the generic "beach") get an extra boost
  // when they appear in the title — this surfaces photo titles that
  // mention the beach by name.
  for (const term of beachTerms) {
    if (term.length < 4) continue;
    if (term === "beach") continue;
    if (t.includes(term)) score += 2;
  }
  return score;
}

async function fetchGeosearchTitles(lat: number, lon: number): Promise<string[]> {
  const search = await mwGet<{ query?: { geosearch?: { title: string }[] } }>({
    action: "query",
    format: "json",
    list: "geosearch",
    gscoord: `${lat}|${lon}`,
    gsradius: String(GEOSEARCH_RADIUS_M),
    gsnamespace: "6",
    gslimit: String(SEARCH_HIT_LIMIT),
  });
  return (search?.query?.geosearch ?? []).map((h) => h.title);
}

async function fetchTextSearchTitles(query: string): Promise<string[]> {
  const search = await mwGet<{ query?: { search?: { title: string }[] } }>({
    action: "query",
    format: "json",
    list: "search",
    srsearch: query,
    srnamespace: "6",
    srlimit: String(SEARCH_HIT_LIMIT),
  });
  return (search?.query?.search ?? []).map((h) => h.title);
}

async function fetchCandidatePages(titles: string[]): Promise<MwSearchPage[]> {
  if (titles.length === 0) return [];
  const info = await mwGet<{ query?: { pages?: Record<string, MwSearchPage> } }>({
    action: "query",
    format: "json",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|mime",
  });
  return info?.query?.pages ? Object.values(info.query.pages) : [];
}

async function pickBestCandidate(
  beachName: string,
  options: { lat?: number; lon?: number }
): Promise<string | null> {
  const terms = beachName.toLowerCase().split(/\s+/).filter(Boolean);

  // Combine candidate pools from up to three queries. Geosearch hits photos
  // tagged at the exact landmark; text-search hits photos tagged at the city
  // level (often where famous beaches are catalogued). Deduping across
  // pools gives the scorer more material to choose from without polluting
  // the result with duplicates.
  const pools: string[][] = [];
  if (options.lat != null && options.lon != null) {
    pools.push(await fetchGeosearchTitles(options.lat, options.lon));
  }
  pools.push(await fetchTextSearchTitles(`${beachName} beach`));
  pools.push(await fetchTextSearchTitles(beachName));
  const allTitles = Array.from(new Set(pools.flat()));
  if (allTitles.length === 0) return null;

  const pages = await fetchCandidatePages(allTitles);
  let best: { score: number; url: string } | null = null;
  for (const p of pages) {
    if (!p.imageinfo || p.imageinfo.length === 0) continue;
    const ii = p.imageinfo[0];
    if (!ii.url || !isHeroCandidateUrl(ii.url, ii.mime)) continue;
    const sc = relevanceScore(p.title, terms);
    if (best === null || sc > best.score) {
      best = { score: sc, url: ii.url };
    }
  }
  if (!best || best.score <= 0) return null;
  return best.url;
}

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const rawName = (params.get("beach") || "").trim();
  if (!rawName) {
    return NextResponse.json({ url: FALLBACK_URL, source: "fallback" });
  }

  const latStr = params.get("lat");
  const lonStr = params.get("lon");
  const lat = latStr != null && latStr !== "" ? parseFloat(latStr) : undefined;
  const lon = lonStr != null && lonStr !== "" ? parseFloat(lonStr) : undefined;
  const coordsValid = typeof lat === "number" && typeof lon === "number"
    && Number.isFinite(lat) && Number.isFinite(lon);

  // Cache key includes coords when present so the same beach name from
  // different coordinates doesn't collide on a stale result.
  const cacheKey = coordsValid ? `${normalizeBeachKey(rawName)}@${lat!.toFixed(3)},${lon!.toFixed(3)}` : normalizeBeachKey(rawName);
  const cached = wikimediaImageCache.get(cacheKey);
  if (cached !== undefined) {
    const url = cached === "" ? FALLBACK_URL : cached;
    return NextResponse.json({ url, source: cached === "" ? "cached-miss" : "cache" });
  }

  let photoUrl: string | null = null;
  if (coordsValid) {
    photoUrl = await pickBestCandidate(rawName, { lat, lon });
  }
  if (!photoUrl) {
    // Fall back to text-only search. Useful when coords are missing.
    photoUrl = await pickBestCandidate(rawName, { lat: undefined, lon: undefined });
  }

  if (photoUrl) {
    wikiCacheHit(cacheKey, photoUrl);
    return NextResponse.json({ url: photoUrl, source: "wikimedia" });
  }
  wikiCacheMiss(cacheKey);
  return NextResponse.json({ url: FALLBACK_URL, source: "no-match" });
}

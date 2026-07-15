import { NextRequest, NextResponse } from "next/server";
import { getBeachData } from "@/lib/beach-api";
import { checkRateLimit, getClientIp, RATE_LIMIT_CONFIG } from "@/lib/rate-limit";
import { beachResponseCache, normalizeBeachKey } from "@/lib/response-cache";

// Force-dynamic so this route is never cached at the Next.js level
// (we manage caching ourselves with explicit TTLs).
export const dynamic = "force-dynamic";

// Reject pathological inputs early. The actual handling tolerates longer
// names, but anything absurd is a sign of abuse.
const MAX_BEACH_LEN = 200;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const retryAfterMs = checkRateLimit(ip);
  console.log(`[beach-api] ${ip} ${request.method} ${request.url}`);
  if (retryAfterMs !== null) {
    const retryAfterSec = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(RATE_LIMIT_CONFIG.maxHits),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil((Date.now() + retryAfterMs) / 1000)),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawName = searchParams.get("beach");
  const beachName = rawName?.trim() ?? "";
  if (!beachName) {
    return NextResponse.json({ error: "Missing beach parameter" }, { status: 400 });
  }
  if (beachName.length > MAX_BEACH_LEN) {
    return NextResponse.json({ error: "Beach name too long" }, { status: 400 });
  }

  const cacheKey = normalizeBeachKey(beachName);
  const cached = beachResponseCache.get(cacheKey);
  if (cached !== undefined) {
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      },
    });
  }

  try {
    const data = await getBeachData(beachName);
    beachResponseCache.set(cacheKey, data);
    return NextResponse.json(data, {
      headers: {
        "X-Cache": "MISS",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch beach data", details: String(error) },
      { status: 500 }
    );
  }
}

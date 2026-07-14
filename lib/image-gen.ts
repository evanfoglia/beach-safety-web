/**
 * Beach image generation — calls the MiniMax MCP server, downloads the result,
 * and caches it locally so repeated searches for the same beach don't re-generate.
 *
 * Flow:
 *   1. Slug + hash the beach name → cache filename
 *   2. If public/generated/beaches/{slug}-{hash}.jpg exists, return its URL
 *   3. Otherwise call minimax.text_to_image via mcporter, parse URL, fetch bytes, save
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

type CallOnceFn = (params: {
  server: string;
  toolName: string;
  args?: Record<string, unknown>;
}) => Promise<unknown>;

let cachedCallOnce: CallOnceFn | null = null;
async function getCallOnce(): Promise<CallOnceFn> {
  if (cachedCallOnce) return cachedCallOnce;
  const mod = await import("mcporter");
  cachedCallOnce = (mod as unknown as { callOnce: CallOnceFn }).callOnce;
  return cachedCallOnce;
}

const CACHE_DIR = path.join(process.cwd(), "public", "generated", "beaches");
const PUBLIC_URL_PREFIX = "/generated/beaches";

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "beach";
}

function hash(name: string): string {
  return crypto.createHash("sha1").update(name).digest("hex").slice(0, 8);
}

/**
 * Build a MiniMax prompt for a beach. Includes regional cues when lat/lon is given.
 * Always: surfer, editorial, no text/logos, cinematic.
 */
function buildPrompt(beachName: string, lat?: number | null, lon?: number | null): string {
  // Drop "Beach, City, State, Country" trailing parts for cleaner prompts.
  const shortName = beachName.split(",")[0].trim();
  // Detect likely region from common keywords for environmental cues.
  const lower = beachName.toLowerCase();
  const regionHints: string[] = [];
  if (/hawaii|honolulu|oahu|maui|kauai|big island|waikiki|pipeline|north shore/.test(lower)) {
    regionHints.push("Hawaiian tropical setting, lush green cliffs, palm tree silhouettes");
  } else if (/cali|la|jolla|santa|malibu|huntington|trestles/.test(lower)) {
    regionHints.push("Southern California coastline, golden cliffs, Pacific Ocean");
  } else if (/florida|juno|palm beach|miami|cocoa|daytona/.test(lower)) {
    regionHints.push("Florida Atlantic coast, turquoise water, sandy beach, sunny sky");
  } else if (/bondi|sydney|byron|australia/.test(lower)) {
    regionHints.push("Australian east coast, rugged sandstone cliffs, turquoise water");
  } else if (/uk|england|cornwall/.test(lower)) {
    regionHints.push("English Channel coast, moody grey skies, cold Atlantic water");
  } else if (/bali|indonesia|canggu|kuta/.test(lower)) {
    regionHints.push("Bali tropical beach, lush jungle cliffs, warm water, volcanic sand");
  } else if (/france|hossegor|biarritz/.test(lower)) {
    regionHints.push("Southwest France Atlantic coast, golden dunes, longboard wave");
  }
  const region = regionHints.length ? `${regionHints[0]}, ` : "";

  return (
    `Cinematic editorial surf photograph of a surfer riding a wave at ${shortName}, ` +
    `${region}moody overcast sky or warm sunset light, deep teal and emerald ocean water, ` +
    `dramatic wave, low-key lighting, no text no logos no UI, ultra realistic, 35mm film grain`
  );
}

interface GenerateResult {
  url: string;
  cached: boolean;
  prompt: string;
}

/**
 * Get or generate a beach image. Returns the public URL to the cached image.
 */
export async function getBeachImage(
  beachName: string,
  lat?: number | null,
  lon?: number | null
): Promise<GenerateResult> {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const beachSlug = slug(beachName);
  const hashStr = hash(beachName);
  const filename = `${beachSlug}-${hashStr}.jpg`;
  const filepath = path.join(CACHE_DIR, filename);

  // Cache hit
  try {
    const stat = await fs.stat(filepath);
    if (stat.size > 1024) {
      return { url: `${PUBLIC_URL_PREFIX}/${filename}`, cached: true, prompt: "" };
    }
  } catch {
    /* miss */
  }

  // Generate
  const callOnce = await getCallOnce();
  const prompt = buildPrompt(beachName, lat, lon);

  const raw = (await callOnce({
    server: "minimax",
    toolName: "text_to_image",
    args: { prompt, aspect_ratio: "16:9" },
  })) as Record<string, unknown>;

  // Parse MCP envelope
  const content = raw.content as Array<{ type: string; text: string }> | undefined;
  const text = content?.[0]?.text ?? "";
  const urlMatch = text.match(/https?:\/\/[^\s'"]+/);
  if (!urlMatch) {
    throw new Error(`minimax did not return an image URL: ${text.slice(0, 200)}`);
  }
  const imageUrl = urlMatch[0];

  // Download image bytes
  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Failed to fetch generated image: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`Generated image too small (${buf.length} bytes)`);

  await fs.writeFile(filepath, buf);

  return { url: `${PUBLIC_URL_PREFIX}/${filename}`, cached: false, prompt };
}

/**
 * Synchronous helper to check if a beach image is already cached. Used by the
 * API route to decide whether to call minimax or short-circuit.
 */
export function cachedImagePathFor(beachName: string): string | null {
  const beachSlug = slug(beachName);
  const hashStr = hash(beachName);
  const filename = `${beachSlug}-${hashStr}.jpg`;
  return path.join(CACHE_DIR, filename);
}

// Re-export for tests
export const _internals = { slug, hash, buildPrompt, CACHE_DIR };
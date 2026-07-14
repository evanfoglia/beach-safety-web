import { NextRequest, NextResponse } from "next/server";
import { getBeachImage } from "@/lib/image-gen";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const beachName = searchParams.get("beach");
  const latStr = searchParams.get("lat");
  const lonStr = searchParams.get("lon");

  if (!beachName) {
    return NextResponse.json({ error: "Missing beach parameter" }, { status: 400 });
  }

  const lat = latStr ? Number(latStr) : null;
  const lon = lonStr ? Number(lonStr) : null;

  try {
    const result = await getBeachImage(beachName, lat, lon);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[image-gen] failed:", error);
    return NextResponse.json(
      { error: "Image generation failed", details: String(error) },
      { status: 500 }
    );
  }
}
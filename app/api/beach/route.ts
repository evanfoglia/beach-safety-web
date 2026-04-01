import { NextRequest, NextResponse } from "next/server";
import { getBeachData } from "@/lib/beach-api";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const beachName = searchParams.get("beach");

  if (!beachName) {
    return NextResponse.json({ error: "Missing beach parameter" }, { status: 400 });
  }

  try {
    const data = await getBeachData(beachName);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch beach data", details: String(error) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getBeachData } from "@/lib/beach-api";
import { getBeachReportViaMcp, isMcpReachable, mcpEnabled } from "@/lib/mcp-client";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const beachName = searchParams.get("beach");

  if (!beachName) {
    return NextResponse.json({ error: "Missing beach parameter" }, { status: 400 });
  }

  // Try MCP first if enabled + reachable. Falls back to pure-JS for reliability.
  if (mcpEnabled()) {
    try {
      const up = await isMcpReachable();
      if (up) {
        const data = await getBeachReportViaMcp(beachName);
        return NextResponse.json({ ...data, _source: "mcp" });
      }
      console.warn("[beach] MCP enabled but daemon unreachable, using pure-JS");
    } catch (mcpErr) {
      console.warn("[beach] MCP call failed, falling back to JS:", mcpErr);
    }
  }

  try {
    const data = await getBeachData(beachName);
    return NextResponse.json({ ...data, _source: "js" });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch beach data", details: String(error) },
      { status: 500 }
    );
  }
}
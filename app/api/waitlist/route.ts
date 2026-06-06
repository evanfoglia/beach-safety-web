import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { config, isEmailReady } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "waitlist.json");

interface WaitlistEntry {
  email: string;
  source: string;
  ts: string;
}

async function readWaitlist(): Promise<WaitlistEntry[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw) as WaitlistEntry[];
  } catch {
    return [];
  }
}

async function writeWaitlist(entries: WaitlistEntry[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2));
}

async function notifyOwner(entry: WaitlistEntry): Promise<void> {
  if (!isEmailReady()) return;
  const subject = `🌊 BeachCast Pro waitlist: ${entry.email}`;
  const text = `New waitlist signup\n\nEmail: ${entry.email}\nSource: ${entry.source}\nTime: ${entry.ts}\n\nTotal signups: ${
    (await readWaitlist()).length
  }`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BeachCast <noreply@beachcast.app>",
        to: [config.notifyEmail],
        subject,
        text,
      }),
    });
  } catch (e) {
    // Owner-notify failure is non-fatal; signup still saved.
    console.error("Resend notify failed:", e);
  }
}

export async function POST(req: NextRequest) {
  let body: { email?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const source = (body.source || "unknown").trim().slice(0, 64);
  if (!email || !email.includes("@") || email.length > 200) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const entries = await readWaitlist();
  if (entries.some((e) => e.email === email)) {
    return NextResponse.json({ ok: true, deduped: true });
  }
  const entry: WaitlistEntry = { email, source, ts: new Date().toISOString() };
  entries.push(entry);
  await writeWaitlist(entries);
  // fire-and-forget owner notify
  void notifyOwner(entry);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Cheap health check; not for production
  const entries = await readWaitlist();
  return NextResponse.json({ count: entries.length });
}

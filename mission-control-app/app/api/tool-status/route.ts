import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface ToolStatus {
  name: string;
  status: "active" | "expired";
  lastRefreshed: string | null;
  expiresAt: string | null;
}

export async function GET() {
  const dataDir = path.join(process.cwd(), "data");
  const tools: ToolStatus[] = [];

  // LinkedIn
  try {
    const raw = await fs.readFile(path.join(dataDir, "linkedin_cookies.json"), "utf-8");
    const data = JSON.parse(raw);
    const savedAt = data.savedAt ?? null;
    // li_at cookie note mentions expiry — parse from note or default 1 year
    const noteMatch = data.note?.match(/expires (\d{4}-\d{2}-\d{2})/);
    const expiresAt = noteMatch ? noteMatch[1] : null;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    tools.push({
      name: "LinkedIn",
      status: isExpired ? "expired" : "active",
      lastRefreshed: savedAt,
      expiresAt,
    });
  } catch {
    tools.push({ name: "LinkedIn", status: "expired", lastRefreshed: null, expiresAt: null });
  }

  // ZoomInfo
  try {
    const raw = await fs.readFile(path.join(dataDir, "zoominfo_cookies.json"), "utf-8");
    const data = JSON.parse(raw);
    const savedAt = data.capturedAt ?? null;
    // Use first cookie's expiry
    const firstCookie = data.cookies?.[0];
    const expiresAt = firstCookie?.expires ?? null;
    const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;
    tools.push({
      name: "ZoomInfo",
      status: isExpired ? "expired" : "active",
      lastRefreshed: savedAt,
      expiresAt,
    });
  } catch {
    tools.push({ name: "ZoomInfo", status: "expired", lastRefreshed: null, expiresAt: null });
  }

  return NextResponse.json({ tools });
}

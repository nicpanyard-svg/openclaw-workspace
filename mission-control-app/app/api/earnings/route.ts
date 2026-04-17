import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "..", "data", "earnings-calendar.json");
const SCRIPT_PATH = path.join(process.cwd(), "..", "scripts", "earnings-fetcher.js");

export async function GET() {
  try {
    const raw = readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Could not read earnings calendar", detail: msg }, { status: 500 });
  }
}

export async function POST() {
  try {
    // Re-run the earnings fetcher script
    execSync(
      `node --max-http-header-size=65536 "${SCRIPT_PATH}"`,
      { cwd: path.join(process.cwd(), ".."), timeout: 90000, stdio: "pipe" }
    );

    // Read and return fresh data
    const raw = readFileSync(DATA_PATH, "utf8");
    const data = JSON.parse(raw);
    return NextResponse.json({ success: true, ...data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Refresh failed", detail: msg }, { status: 500 });
  }
}

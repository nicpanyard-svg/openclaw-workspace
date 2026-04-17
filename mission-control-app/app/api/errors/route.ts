import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";

export interface ErrorEntry {
  id: string;
  timestamp: string;
  source: string;
  severity: "error" | "warn" | "info";
  message: string;
}

const DATA_PATH = join(process.cwd(), "data", "error-log.json");

function readErrors(): ErrorEntry[] {
  try {
    const raw = readFileSync(DATA_PATH, "utf-8");
    return JSON.parse(raw) as ErrorEntry[];
  } catch {
    return [];
  }
}

function writeErrors(entries: ErrorEntry[]) {
  writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

export async function GET() {
  const errors = readErrors();
  // Return most recent 200 entries, newest first
  const sorted = [...errors].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice(0, 200);
  return NextResponse.json({ errors: sorted, total: errors.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { source, severity, message } = body;

  if (!source || !severity || !message) {
    return NextResponse.json({ error: "Missing required fields: source, severity, message" }, { status: 400 });
  }

  const entry: ErrorEntry = {
    id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    source: String(source),
    severity: ["error", "warn", "info"].includes(severity) ? severity : "info",
    message: String(message),
  };

  const errors = readErrors();
  errors.push(entry);

  // Keep last 1000 entries
  if (errors.length > 1000) errors.splice(0, errors.length - 1000);

  writeErrors(errors);
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}

export async function DELETE() {
  writeErrors([]);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "Server-side PDF generation is disabled. Use /proposal/print so the browser prints the exact same HTML preview.",
    },
    { status: 410 },
  );
}

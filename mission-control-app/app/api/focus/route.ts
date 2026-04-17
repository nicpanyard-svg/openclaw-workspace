import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

const DATA_PATH = join(process.cwd(), "data", "focus.json");

function read(): { note: string; updatedAt: string } {
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  } catch {
    return { note: "", updatedAt: "" };
  }
}

export async function GET() {
  return Response.json(read());
}

export async function POST(req: NextRequest) {
  const { note } = await req.json();
  const data = { note: note ?? "", updatedAt: new Date().toISOString() };
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
  return Response.json(data);
}

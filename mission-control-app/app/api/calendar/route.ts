import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_PATH = join(process.cwd(), "data", "calendar.json");

export async function GET() {
  if (!existsSync(DATA_PATH)) {
    return Response.json({ events: [], lastUpdated: null });
  }

  const raw = readFileSync(DATA_PATH, "utf-8");
  const data = JSON.parse(raw);
  return Response.json(data);
}

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PATHS = [
  join(process.cwd(), "..", "graham-stock-board", "day-trades.json"),
  join(process.cwd(), "public", "graham-board", "day-trades.json"),
];

export async function GET() {
  for (const p of PATHS) {
    if (existsSync(p)) {
      const raw = readFileSync(p, "utf-8");
      const data = JSON.parse(raw);
      return Response.json(data);
    }
  }

  return Response.json(
    { error: "day-trades.json not found", positions: [], trades: [] },
    { status: 200 },
  );
}

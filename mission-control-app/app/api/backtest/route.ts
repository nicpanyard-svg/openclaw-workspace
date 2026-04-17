import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

const WORKSPACE = path.resolve(process.cwd(), "..");
const SCRIPT = path.join(WORKSPACE, "scripts", "backtest-engine.js");
const RESULTS = path.join(WORKSPACE, "data", "backtest-results.json");

export async function POST() {
  return new Promise<NextResponse>((resolve) => {
    exec(
      `node "${SCRIPT}"`,
      { cwd: WORKSPACE, timeout: 120_000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[backtest] error:", error.message);
          console.error("[backtest] stderr:", stderr);
          resolve(
            NextResponse.json(
              { error: "Backtest script failed", detail: error.message },
              { status: 500 }
            )
          );
          return;
        }

        try {
          const raw = fs.readFileSync(RESULTS, "utf8");
          const data = JSON.parse(raw);
          resolve(NextResponse.json({ ok: true, ...data }));
        } catch (e) {
          resolve(
            NextResponse.json(
              { error: "Could not read results", detail: String(e) },
              { status: 500 }
            )
          );
        }
      }
    );
  });
}

export async function GET() {
  try {
    if (!fs.existsSync(RESULTS)) {
      return NextResponse.json({ results: [], totalTested: 0, wins: 0, losses: 0, winRate: 0, avgReturn: 0 });
    }
    const raw = fs.readFileSync(RESULTS, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Could not load results" }, { status: 500 });
  }
}

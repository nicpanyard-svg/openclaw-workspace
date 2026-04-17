import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";

const WORKSPACE = path.resolve(process.cwd(), "..");
const SCRIPT = path.join(WORKSPACE, "scripts", "auto-rescore.js");
const SCORES_FILE = path.join(WORKSPACE, "data", "stock-scores.json");
const LOG_FILE = path.join(WORKSPACE, "data", "rescore-log.json");

export async function POST() {
  return new Promise<NextResponse>((resolve) => {
    exec(
      `node "${SCRIPT}"`,
      { cwd: WORKSPACE, timeout: 180_000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[rescore] error:", error.message);
          console.error("[rescore] stderr:", stderr);
          resolve(
            NextResponse.json(
              { error: "Rescore script failed", detail: error.message, stderr },
              { status: 500 }
            )
          );
          return;
        }

        try {
          const scores = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
          const logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
          resolve(
            NextResponse.json({
              ok: true,
              ...scores,
              lastRun: logs[0] ?? null,
              stdout: stdout.slice(-2000),
            })
          );
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
    if (!fs.existsSync(SCORES_FILE)) {
      return NextResponse.json({
        scores: [],
        totalStocks: 0,
        generated: null,
        lastRun: null,
      });
    }
    const scores = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
    let lastRun = null;
    if (fs.existsSync(LOG_FILE)) {
      const logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
      lastRun = logs[0] ?? null;
    }
    return NextResponse.json({ ...scores, lastRun });
  } catch (e) {
    return NextResponse.json(
      { error: "Could not load scores", detail: String(e) },
      { status: 500 }
    );
  }
}

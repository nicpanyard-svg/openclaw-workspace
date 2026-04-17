import { readFileSync, existsSync } from "fs";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const logFile = req.nextUrl.searchParams.get("logFile");

  if (!logFile) return Response.json({ output: "" });

  // security: only allow files under known temp/log paths
  const allowed = [
    "C:\\Users\\IkeFl\\AppData\\Local\\Temp",
    "C:\\Users\\IkeFl\\.openclaw\\workspace",
  ];
  const safe = allowed.some((p) => logFile.startsWith(p));
  if (!safe) return Response.json({ error: "path not allowed" }, { status: 403 });

  if (!existsSync(logFile)) return Response.json({ output: "(log not yet available)" });

  const raw = readFileSync(logFile, "utf-8");
  // Return last 200 lines to keep it lean
  const lines = raw.split("\n");
  const tail = lines.slice(-200).join("\n");
  return Response.json({ output: tail });
}

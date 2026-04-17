import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

export interface CodingSession {
  id: string;
  agent: string;
  task: string;
  status: "running" | "done" | "error";
  startedAt: string;
  finishedAt?: string;
  logFile?: string;
  taskId?: string;
  output?: string;
}

const DATA_PATH = join(process.cwd(), "data", "coding-sessions.json");

function read(): CodingSession[] {
  try {
    return JSON.parse(readFileSync(DATA_PATH, "utf-8")).sessions as CodingSession[];
  } catch { return []; }
}

function write(sessions: CodingSession[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ sessions }, null, 2), "utf-8");
}

export async function GET() {
  return Response.json({ sessions: read() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sessions = read();
  const session: CodingSession = {
    id: crypto.randomUUID(),
    agent: body.agent ?? "Agent",
    task: body.task ?? "",
    status: "running",
    startedAt: new Date().toISOString(),
    logFile: body.logFile,
    taskId: body.taskId,
    output: body.output ?? "",
  };
  sessions.push(session);
  write(sessions);
  return Response.json({ session }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const sessions = read();
  const idx = sessions.findIndex((s) => s.id === body.id);
  if (idx === -1) return Response.json({ error: "not found" }, { status: 404 });
  sessions[idx] = { ...sessions[idx], ...body };
  write(sessions);
  return Response.json({ session: sessions[idx] });
}

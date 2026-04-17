import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

export interface AgentStatus {
  name: string;
  status: "ACTIVE" | "IDLE" | "WARN" | "DOWN";
  currentTask: string;
  lastActive: string;
  blocker: string | null;
  nextStep: string;
}

interface StatusFile {
  agents: AgentStatus[];
  lastUpdated: string;
}

interface SessionRecord {
  updatedAt: number;
  [key: string]: unknown;
}

const DATA_PATH = join(process.cwd(), "data", "agent-status.json");

// Primary: OpenClaw's consolidated live session file
// Fallback: per-agent sessions file for Ike
const SESSIONS_FILES = [
  "C:\\Users\\IkeFl\\.openclaw\\sessions.json",
  "C:\\Users\\IkeFl\\.openclaw\\agents\\main\\sessions\\sessions.json",
];

function resolveAgentName(key: string): string | null {
  if (key === "agent:main:telegram:direct:8525960420") return "Ike";
  if (key.toLowerCase().includes("graham")) return "Graham";
  if (key.toLowerCase().includes("mike")) return "Mike";
  if (key.toLowerCase().includes("jill")) return "Jill";
  // Fallback: main agent sessions that aren't cron jobs map to Ike
  if (key.startsWith("agent:main:") && !key.includes(":cron:")) return "Ike";
  return null;
}

function statusFromElapsed(elapsedMs: number): "ACTIVE" | "IDLE" | "WARN" | "DOWN" {
  const min = elapsedMs / 60000;
  if (min < 15) return "ACTIVE";
  if (min < 480) return "IDLE";
  if (min < 1440) return "WARN";
  return "DOWN";
}

function readLiveFromSessions(): Map<string, { lastActiveMs: number; status: "ACTIVE" | "IDLE" | "WARN" | "DOWN"; lastActive: string }> {
  const result = new Map<string, { lastActiveMs: number; status: "ACTIVE" | "IDLE" | "WARN" | "DOWN"; lastActive: string }>();

  // Try each sessions file in order; use the first one that loads successfully
  let sessions: Record<string, SessionRecord> | null = null;
  for (const filePath of SESSIONS_FILES) {
    if (!existsSync(filePath)) continue;
    try {
      sessions = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, SessionRecord>;
      break;
    } catch {
      // try next
    }
  }

  if (!sessions) return result;

  const now = Date.now();

  for (const [key, record] of Object.entries(sessions)) {
    if (typeof record.updatedAt !== "number") continue;

    const agentName = resolveAgentName(key);
    if (!agentName) continue;

    const existing = result.get(agentName);
    if (!existing || record.updatedAt > existing.lastActiveMs) {
      const elapsedMs = now - record.updatedAt;
      result.set(agentName, {
        lastActiveMs: record.updatedAt,
        status: statusFromElapsed(elapsedMs),
        lastActive: new Date(record.updatedAt).toISOString(),
      });
    }
  }

  return result;
}

function readStatus(): StatusFile {
  if (!existsSync(DATA_PATH)) {
    return { agents: [], lastUpdated: new Date().toISOString() };
  }
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as StatusFile;
}

function writeStatus(data: StatusFile) {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
  const data = readStatus();
  const liveMap = readLiveFromSessions();

  // Merge live session data into stored agent records
  const merged = data.agents.map((agent) => {
    const live = liveMap.get(agent.name);
    if (live) {
      return {
        ...agent,
        status: live.status,
        lastActive: live.lastActive,
      };
    }
    return agent;
  });

  // Add any live agents not yet in status.json
  for (const [name, live] of liveMap.entries()) {
    if (!merged.find((a) => a.name === name)) {
      merged.push({
        name,
        status: live.status,
        currentTask: "",
        lastActive: live.lastActive,
        blocker: null,
        nextStep: "",
      });
    }
  }

  return Response.json({ agents: merged, lastUpdated: new Date().toISOString() });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, status, currentTask, blocker, nextStep } = body;

  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const data = readStatus();
  const idx = data.agents.findIndex(
    (a) => a.name.toLowerCase() === name.toLowerCase()
  );

  const update: AgentStatus = {
    name,
    status: status ?? "ACTIVE",
    currentTask: currentTask ?? "",
    lastActive: new Date().toISOString(),
    blocker: blocker ?? null,
    nextStep: nextStep ?? "",
  };

  if (idx >= 0) {
    data.agents[idx] = { ...data.agents[idx], ...update };
  } else {
    data.agents.push(update);
  }

  data.lastUpdated = new Date().toISOString();
  writeStatus(data);

  return Response.json({ agent: update }, { status: 200 });
}

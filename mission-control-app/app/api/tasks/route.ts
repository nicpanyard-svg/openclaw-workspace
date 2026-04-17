import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

export interface TaskMessage {
  id: string;
  from: "nick" | "ike";
  text: string;
  sentAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: "P0" | "P1" | "P2";
  status: "Backlog" | "In Progress" | "Blocked" | "Done";
  createdAt: string;
  completedAt?: string;
  archived?: boolean;
  notes?: string;
  messages?: TaskMessage[];
  dueDate?: string;
}

const DATA_PATH = join(process.cwd(), "data", "tasks.json");

function readTasks(): Task[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw).tasks as Task[];
}

function writeTasks(tasks: Task[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ tasks }, null, 2), "utf-8");
}

const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: NextRequest) {
  const tasks = readTasks();
  const now = Date.now();
  let dirty = false;

  // Auto-archive Done tasks older than 24h
  for (const t of tasks) {
    if (!t.archived && t.status === "Done" && t.completedAt) {
      if (now - new Date(t.completedAt).getTime() >= ARCHIVE_AFTER_MS) {
        t.archived = true;
        dirty = true;
      }
    }
  }

  if (dirty) writeTasks(tasks);

  const showArchived = request.nextUrl.searchParams.get("archived") === "true";
  return Response.json({
    tasks: showArchived ? tasks.filter((t) => t.archived) : tasks.filter((t) => !t.archived),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title, description, assignee, priority, status, dueDate } = body;

  const task: Task = {
    id: crypto.randomUUID(),
    title,
    description,
    assignee,
    priority,
    status,
    createdAt: new Date().toISOString(),
    dueDate: dueDate || undefined,
  };

  const tasks = readTasks();
  tasks.push(task);
  writeTasks(tasks);

  return Response.json({ task }, { status: 201 });
}

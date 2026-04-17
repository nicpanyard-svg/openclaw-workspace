import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { NextRequest } from "next/server";
import type { Task } from "../route";

const DATA_PATH = join(process.cwd(), "data", "tasks.json");

function readTasks(): Task[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw).tasks as Task[];
}

function writeTasks(tasks: Task[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ tasks }, null, 2), "utf-8");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, status, notes, assignee, dueDate, notify } = body as {
    id: string;
    status?: Task["status"];
    notes?: string;
    assignee?: string;
    dueDate?: string;
    notify?: boolean;
  };

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const updates: Partial<Task> = {};
  if (status !== undefined) {
    updates.status = status;
    if (status === "Done") {
      updates.completedAt = new Date().toISOString();
    } else {
      // If moved back out of Done, clear completedAt
      updates.completedAt = undefined;
    }
  }
  if (notes !== undefined) updates.notes = notes;
  if (assignee !== undefined) updates.assignee = assignee;
  if (dueDate !== undefined) updates.dueDate = dueDate || undefined;

  tasks[idx] = { ...tasks[idx], ...updates };
  writeTasks(tasks);

  if (notify) {
    const t = tasks[idx];
    const msg = [
      `📋 Task Note from Mission Control`,
      ``,
      `Task: ${t.title}`,
      `Assigned to: ${t.assignee}`,
      t.notes ? `Notes: ${t.notes}` : `(no notes)`,
    ].join("\n");
    exec(`openclaw message send --channel telegram --target 8525960420 --message ${JSON.stringify(msg)}`);
  }

  return Response.json({ task: tasks[idx] });
}

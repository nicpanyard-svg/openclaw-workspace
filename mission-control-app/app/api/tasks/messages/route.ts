import { readFileSync, writeFileSync } from "fs";
import { exec } from "child_process";
import { join } from "path";
import { NextRequest } from "next/server";
import type { Task, TaskMessage } from "../route";

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
  const { taskId, from, text } = body as { taskId: string; from: "nick" | "ike"; text: string };

  if (!taskId || !from || !text?.trim()) {
    return Response.json({ error: "Missing taskId, from, or text" }, { status: 400 });
  }

  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return Response.json({ error: "Task not found" }, { status: 404 });

  const message: TaskMessage = {
    id: crypto.randomUUID(),
    from,
    text: text.trim(),
    sentAt: new Date().toISOString(),
  };

  if (!tasks[idx].messages) tasks[idx].messages = [];
  tasks[idx].messages!.push(message);
  writeTasks(tasks);

  // If Nick sends a message, notify Ike via Telegram with task ID embedded for reply routing
  if (from === "nick") {
    const task = tasks[idx];
    const notification = `💬 Task Thread [task:${task.id}]\n\n"${task.title}"\n\nNick: ${text.trim()}`;
    exec(`openclaw message send --channel telegram --target 8525960420 --message ${JSON.stringify(notification)}`);
  }

  return Response.json({ message });
}

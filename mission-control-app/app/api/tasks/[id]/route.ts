import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  tasks[idx] = { ...tasks[idx], ...body, id };
  writeTasks(tasks);

  return Response.json({ task: tasks[idx] });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tasks = readTasks();
  const idx = tasks.findIndex((t) => t.id === id);

  if (idx === -1) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  tasks.splice(idx, 1);
  writeTasks(tasks);

  return new Response(null, { status: 204 });
}

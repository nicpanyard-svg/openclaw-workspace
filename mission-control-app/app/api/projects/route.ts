import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

export interface Project {
  id: string;
  name: string;
  status: "Active" | "On Hold" | "Complete" | "Archived";
  owner: string;
  progress: number;
  tags: string[];
  description: string;
  updatedAt: string;
}

const DATA_PATH = join(process.cwd(), "data", "projects.json");

function readProjects(): Project[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw).projects as Project[];
}

function writeProjects(projects: Project[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ projects }, null, 2), "utf-8");
}

export async function GET() {
  const projects = readProjects();
  return Response.json({ projects });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, status, owner, progress, tags, description } = body;

  const project: Project = {
    id: crypto.randomUUID(),
    name,
    status,
    owner,
    progress: progress ?? 0,
    tags: tags ?? [],
    description: description ?? "",
    updatedAt: new Date().toISOString().split("T")[0],
  };

  const projects = readProjects();
  projects.push(project);
  writeProjects(projects);

  return Response.json({ project }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  const projects = readProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return Response.json({ error: "Not found" }, { status: 404 });

  projects[idx] = { ...projects[idx], ...updates, updatedAt: new Date().toISOString().split("T")[0] };
  writeProjects(projects);

  return Response.json({ project: projects[idx] });
}

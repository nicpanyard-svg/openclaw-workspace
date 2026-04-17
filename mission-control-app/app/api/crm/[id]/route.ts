import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import type { Lead } from "../route";

const DATA_PATH = join(process.cwd(), "data", "crm-leads.json");

function readLeads(): Lead[] {
  if (!existsSync(DATA_PATH)) return [];
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw).leads as Lead[];
}

function writeLeads(leads: Lead[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ leads }, null, 2), "utf-8");
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);

  if (idx === -1) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  leads[idx] = { ...leads[idx], ...body, id, updatedAt: new Date().toISOString() };
  writeLeads(leads);

  return Response.json({ lead: leads[idx] });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);

  if (idx === -1) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  leads.splice(idx, 1);
  writeLeads(leads);

  return new Response(null, { status: 204 });
}

import { readFileSync, writeFileSync, existsSync } from "fs";
import { exec } from "child_process";
import { join } from "path";
import { NextRequest } from "next/server";
import type { Lead, LeadMessage } from "../../route";

const DATA_PATH = join(process.cwd(), "data", "crm-leads.json");

function readLeads(): Lead[] {
  if (!existsSync(DATA_PATH)) return [];
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw).leads as Lead[];
}

function writeLeads(leads: Lead[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ leads }, null, 2), "utf-8");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const leads = readLeads();
  const lead = leads.find((l) => l.id === id);
  if (!lead) return Response.json({ error: "Lead not found" }, { status: 404 });
  return Response.json({ messages: lead.messages ?? [] });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { from, text } = body as { from: "nick" | "mike"; text: string };

  if (!from || !text?.trim()) {
    return Response.json({ error: "Missing from or text" }, { status: 400 });
  }

  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return Response.json({ error: "Lead not found" }, { status: 404 });

  const message: LeadMessage = {
    id: crypto.randomUUID(),
    from,
    text: text.trim(),
    sentAt: new Date().toISOString(),
    read: from === "nick", // Nick's own messages are read; Mike's start unread
  };

  if (!leads[idx].messages) leads[idx].messages = [];
  leads[idx].messages!.push(message);
  writeLeads(leads);

  // Notify Mike via Telegram when Nick sends, with lead ID embedded for reply routing
  if (from === "nick") {
    const lead = leads[idx];
    const notification = `💬 CRM Lead Thread [lead:${lead.id}]\n\n"${lead.name}" — ${lead.company}\n\nNick: ${text.trim()}`;
    exec(`openclaw message send --channel telegram --target 8525960420 --message ${JSON.stringify(notification)}`);
  }

  return Response.json({ message }, { status: 201 });
}

// Mark all messages on this lead as read
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === id);
  if (idx === -1) return Response.json({ error: "Lead not found" }, { status: 404 });

  if (leads[idx].messages) {
    leads[idx].messages = leads[idx].messages!.map((m) => ({ ...m, read: true }));
  }
  writeLeads(leads);

  return Response.json({ ok: true });
}

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

export interface Activity {
  id: string;
  type: "note" | "email_sent" | "call" | "meeting" | "linkedin_message";
  note: string;
  date: string;
  by: string;
}

export interface LeadMessage {
  id: string;
  from: "nick" | "mike";
  text: string;
  sentAt: string;
  read: boolean;
}

export interface Lead {
  id: string;
  name: string;
  title: string;
  company: string;
  vertical: "iNet" | "HydraGauge";
  // SDR pipeline: New → Contacted → Engaged → Meeting Booked → Handed Off
  // Needs Info: flagged for missing contact details; leads with no email are auto-flagged
  status: "New" | "Contacted" | "Engaged" | "Meeting Booked" | "Handed Off" | "Needs Info";
  linkedin?: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  // new fields
  source?: string;
  confidence?: "high" | "medium" | "low";
  followUpDate?: string;
  activities?: Activity[];
  messages?: LeadMessage[];
  companySize?: string;
  triggerEvent?: string;
  sequence?: string;
  touchCount?: number;
}

const DATA_PATH = join(process.cwd(), "data", "crm-leads.json");

const VERTICAL_MAP: Record<string, Lead["vertical"]> = {
  inet: "iNet", "iNet": "iNet",
  hydragauge: "HydraGauge", HydraGauge: "HydraGauge",
};

const STATUS_MAP: Record<string, Lead["status"]> = {
  new: "New",
  contacted: "Contacted",
  engaged: "Engaged",
  "meeting booked": "Meeting Booked",
  "handed off": "Handed Off",
  needs_info: "Needs Info",
  "needs info": "Needs Info",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeLead(raw: any): Lead {
  return {
    id: raw.id ?? crypto.randomUUID(),
    name: raw.name ?? "",
    title: raw.title ?? "",
    company: raw.company ?? "",
    vertical: VERTICAL_MAP[raw.vertical] ?? VERTICAL_MAP[(raw.vertical ?? "").toLowerCase()] ?? "iNet",
    status: STATUS_MAP[(raw.status ?? "").toString().trim().toLowerCase()] ?? "New",
    linkedin: raw.linkedin || raw.linkedinUrl || undefined,
    email: raw.email || undefined,
    phone: raw.phone || undefined,
    notes: raw.notes || raw.fit_notes || undefined,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt,
    source: raw.source || undefined,
    confidence: raw.confidence || undefined,
    followUpDate: raw.followUpDate || undefined,
    activities: raw.activities ?? [],
    messages: raw.messages ?? [],
    companySize: raw.companySize || undefined,
    triggerEvent: raw.triggerEvent || undefined,
    sequence: raw.sequence || undefined,
    touchCount: raw.touchCount ?? 0,
  };
}

function readLeads(): Lead[] {
  if (!existsSync(DATA_PATH)) {
    writeFileSync(DATA_PATH, JSON.stringify({ leads: [] }, null, 2), "utf-8");
    return [];
  }
  const raw = readFileSync(DATA_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  const rawLeads: unknown[] = parsed.leads ?? [];
  return rawLeads.map(normalizeLead);
}

function writeLeads(leads: Lead[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ leads }, null, 2), "utf-8");
}

export async function GET() {
  const leads = readLeads();
  return Response.json({ leads });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    name, title, company, vertical, status,
    linkedin, email, phone, notes,
    source, confidence, followUpDate, companySize, triggerEvent, sequence,
  } = body;

  const lead: Lead = {
    id: crypto.randomUUID(),
    name,
    title: title ?? "",
    company: company ?? "",
    vertical,
    status: status ?? "New",
    linkedin: linkedin || undefined,
    email: email || undefined,
    phone: phone || undefined,
    notes: notes || undefined,
    createdAt: new Date().toISOString(),
    source: source || undefined,
    confidence: confidence || "medium",
    followUpDate: followUpDate || undefined,
    activities: [],
    companySize: companySize || undefined,
    triggerEvent: triggerEvent || undefined,
    sequence: sequence || undefined,
    touchCount: 0,
  };

  const leads = readLeads();
  leads.push(lead);
  writeLeads(leads);

  return Response.json({ lead }, { status: 201 });
}

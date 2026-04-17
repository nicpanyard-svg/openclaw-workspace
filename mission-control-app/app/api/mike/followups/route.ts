/**
 * GET /api/mike/followups
 *
 * Returns overdue and upcoming follow-ups from CRM leads.
 * Stable data model — frontend consumes only this endpoint.
 *
 * PATCH /api/mike/followups
 * Update a lead's followUpDate or status.
 * Body: { leadId, followUpDate?, status?, notes? }
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

const CRM_PATH = join(process.cwd(), "data", "crm-leads.json");

interface Lead {
  id: string;
  name: string;
  title?: string;
  company: string;
  email?: string;
  vertical?: string;
  status: string;
  followUpDate?: string;
  touchCount?: number;
  lastContactedAt?: string;
  updatedAt?: string;
  activities?: Array<{ id: string; type: string; note: string; date: string; by: string }>;
  fit_notes?: string;
}

type FollowUpPriority = "overdue" | "today" | "upcoming";

function readLeads(): Lead[] {
  if (!existsSync(CRM_PATH)) return [];
  return JSON.parse(readFileSync(CRM_PATH, "utf-8")).leads ?? [];
}

function writeLeads(leads: Lead[]) {
  writeFileSync(CRM_PATH, JSON.stringify({ leads }, null, 2), "utf-8");
}

function getPriority(followUpDate: string): FollowUpPriority {
  const today = new Date().toISOString().slice(0, 10);
  if (followUpDate < today) return "overdue";
  if (followUpDate === today) return "today";
  return "upcoming";
}

function daysDiff(date: string): number {
  const d = new Date(date).getTime();
  const now = new Date().setHours(0, 0, 0, 0);
  return Math.round((d - now) / (1000 * 60 * 60 * 24));
}

export async function GET() {
  try {
    const leads = readLeads();
    const today = new Date().toISOString().slice(0, 10);
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Handed off leads (meeting requests) — no date filter
    const handedOff = leads
      .filter(l => l.status === 'Handed Off')
      .map(l => ({
        id: l.id,
        name: l.name,
        title: l.title ?? '',
        company: l.company,
        email: l.email ?? '',
        vertical: l.vertical ?? 'Other',
        status: l.status,
        followUpDate: l.followUpDate ?? today,
        priority: 'today' as FollowUpPriority,
        daysUntil: 0,
        touchCount: l.touchCount ?? 0,
        lastContactedAt: l.lastContactedAt ?? null,
        lastActivity: l.activities?.slice(-1)[0] ?? null,
        fitNotes: l.fit_notes ?? '',
      }));

    const withFollowUp = leads
      .filter(l => l.followUpDate && l.followUpDate <= in7Days && l.status !== 'Handed Off')
      .map(l => ({
        id: l.id,
        name: l.name,
        title: l.title ?? "",
        company: l.company,
        email: l.email ?? "",
        vertical: l.vertical ?? "Other",
        status: l.status,
        followUpDate: l.followUpDate!,
        priority: getPriority(l.followUpDate!),
        daysUntil: daysDiff(l.followUpDate!),
        touchCount: l.touchCount ?? 0,
        lastContactedAt: l.lastContactedAt ?? null,
        lastActivity: l.activities?.slice(-1)[0] ?? null,
        fitNotes: l.fit_notes ?? "",
      }))
      .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));

    const overdue   = withFollowUp.filter(f => f.priority === "overdue");
    const dueToday  = withFollowUp.filter(f => f.priority === "today");
    const upcoming  = withFollowUp.filter(f => f.priority === "upcoming");

    return Response.json({
      _version: "1",
      _updatedAt: new Date().toISOString(),
      summary: {
        handedOff: handedOff.length,
        overdue:   overdue.length,
        today:     dueToday.length,
        upcoming:  upcoming.length,
        total:     withFollowUp.length + handedOff.length,
      },
      handedOff,
      overdue,
      today: dueToday,
      upcoming,
    });

  } catch (err) {
    return Response.json({ error: "Failed to load follow-ups", detail: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { leadId, followUpDate, status, notes } = body;

    if (!leadId) {
      return Response.json({ error: "leadId required" }, { status: 400 });
    }

    const leads = readLeads();
    const idx = leads.findIndex(l => l.id === leadId);

    if (idx === -1) {
      return Response.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = leads[idx];
    const now = new Date().toISOString();

    if (followUpDate !== undefined) lead.followUpDate = followUpDate || undefined;
    if (status !== undefined) lead.status = status;
    lead.updatedAt = now;

    if (notes) {
      if (!lead.activities) lead.activities = [];
      lead.activities.push({
        id: crypto.randomUUID(),
        type: "note",
        note: notes,
        date: now,
        by: "Mike",
      });
    }

    leads[idx] = lead;
    writeLeads(leads);

    return Response.json({ lead });

  } catch (err) {
    return Response.json({ error: "Failed to update lead", detail: String(err) }, { status: 500 });
  }
}

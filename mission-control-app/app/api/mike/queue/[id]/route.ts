import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";
import type { OutreachItem } from "../route";

const QUEUE_PATH = join(process.cwd(), "data", "mike-outreach-queue.json");
const CRM_PATH = join(process.cwd(), "data", "crm-leads.json");

function readQueue(): OutreachItem[] {
  if (!existsSync(QUEUE_PATH)) return [];
  return JSON.parse(readFileSync(QUEUE_PATH, "utf-8")).queue as OutreachItem[];
}

function writeQueue(queue: OutreachItem[]) {
  writeFileSync(QUEUE_PATH, JSON.stringify({ queue }, null, 2), "utf-8");
}

interface Lead {
  id: string;
  status: string;
  activities?: Array<{ id: string; type: string; note: string; date: string; by: string }>;
  followUpDate?: string;
  updatedAt?: string;
}

function readLeads(): Lead[] {
  if (!existsSync(CRM_PATH)) return [];
  return JSON.parse(readFileSync(CRM_PATH, "utf-8")).leads as Lead[];
}

function writeLeads(leads: Lead[]) {
  writeFileSync(CRM_PATH, JSON.stringify({ leads }, null, 2), "utf-8");
}

function logLeadActivity(
  leadId: string,
  type: string,
  note: string
) {
  const leads = readLeads();
  const idx = leads.findIndex((l) => l.id === leadId);
  if (idx === -1) return;

  if (!leads[idx].activities) leads[idx].activities = [];
  leads[idx].activities!.push({
    id: crypto.randomUUID(),
    type,
    note,
    date: new Date().toISOString(),
    by: "Mike",
  });
  leads[idx].updatedAt = new Date().toISOString();
  writeLeads(leads);
}

// PUT /api/mike/queue/[id] — approve (triggers send) or reject, or update fields
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const queue = readQueue();
  const idx = queue.findIndex((item) => item.id === id);

  if (idx === -1) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  const item = queue[idx];

  // Handle approval — actually send the email
  if (body.status === "approved" || body.action === "approve") {
    // Apply any field edits before sending
    if (body.subject) item.subject = body.subject;
    if (body.body) item.body = body.body;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sendEmail, replyToEmail } = require("../../../../../scripts/ms-graph-email");
      if (item.replyToMessageId) {
        await replyToEmail(item.replyToMessageId, item.body);
      } else {
        await sendEmail(item.email, item.subject, item.body);
      }

      item.status = "sent";
      item.approvedAt = new Date().toISOString();
      item.sentAt = new Date().toISOString();

      // CRM: log email_sent activity
      if (item.leadId) {
        logLeadActivity(
          item.leadId,
          "email_sent",
          `Email sent — Subject: "${item.subject}"`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: `Send failed: ${message}` }, { status: 502 });
    }
  } else if (body.status === "rejected" || body.action === "reject") {
    item.status = "rejected";
  } else {
    // Generic field update (edit subject/body)
    if (body.subject !== undefined) item.subject = body.subject;
    if (body.body !== undefined) item.body = body.body;
    if (body.leadName !== undefined) item.leadName = body.leadName;
    if (body.company !== undefined) item.company = body.company;
    if (body.email !== undefined) item.email = body.email;
  }

  queue[idx] = item;
  writeQueue(queue);

  return Response.json({ item });
}

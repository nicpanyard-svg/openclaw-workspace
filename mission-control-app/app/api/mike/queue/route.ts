import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

export interface OutreachItem {
  id: string;
  leadId?: string;
  leadName: string;
  company: string;
  email: string;
  subject: string;
  body: string;
  status: "pending" | "approved" | "sent" | "rejected";
  createdAt: string;
  sentAt?: string;
  approvedAt?: string;
  replyToMessageId?: string; // if set, send as threaded reply via Graph
}

export const DAILY_EMAIL_LIMIT = 100;

const QUEUE_PATH = join(process.cwd(), "data", "mike-outreach-queue.json");

export function readQueue(): OutreachItem[] {
  if (!existsSync(QUEUE_PATH)) {
    writeFileSync(QUEUE_PATH, JSON.stringify({ queue: [] }, null, 2), "utf-8");
    return [];
  }
  const raw = readFileSync(QUEUE_PATH, "utf-8");
  return JSON.parse(raw).queue as OutreachItem[];
}

export function writeQueue(queue: OutreachItem[]) {
  writeFileSync(QUEUE_PATH, JSON.stringify({ queue }, null, 2), "utf-8");
}

// GET /api/mike/queue — list all non-rejected items (or filter by ?status=)
export async function GET(request: NextRequest) {
  const queue = readQueue();
  const statusFilter = request.nextUrl.searchParams.get("status");
  const filtered = statusFilter
    ? queue.filter((item) => item.status === statusFilter)
    : queue.filter((item) => item.status !== "rejected");
  return Response.json({ queue: filtered });
}

// POST /api/mike/queue — add a new draft and auto-send immediately
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { leadId, leadName, company, email, subject, body: emailBody } = body;

  if (!email || !subject || !emailBody) {
    return Response.json({ error: "email, subject, and body are required" }, { status: 400 });
  }

  const item: OutreachItem = {
    id: crypto.randomUUID(),
    leadId: leadId || undefined,
    leadName: leadName ?? "",
    company: company ?? "",
    email,
    subject,
    body: emailBody,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);

  // Auto-send immediately — no approval needed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { sendEmail } = require("../../../../scripts/ms-graph-email");
    await sendEmail(item.email, item.subject, item.body);
    item.status = "sent";
    item.sentAt = new Date().toISOString();
    item.approvedAt = item.sentAt;

    // Update queue with sent status
    const updatedQueue = readQueue();
    const idx = updatedQueue.findIndex((q) => q.id === item.id);
    if (idx !== -1) {
      updatedQueue[idx] = item;
      writeQueue(updatedQueue);
    }

    // Update CRM lead status to Contacted
    try {
      const crmPath = join(process.cwd(), "data", "crm-leads.json");
      const { readFileSync: rfs, writeFileSync: wfs, existsSync: efs } = require("fs");
      if (efs(crmPath)) {
        const crmData = JSON.parse(rfs(crmPath, "utf-8"));
        const leads = crmData.leads ?? [];
        let dirty = false;
        const now = new Date().toISOString();
        for (const lead of leads) {
          if (!lead || typeof lead !== "object") continue;
          // Match by leadId or email
          const isMatch = (item.leadId && lead.id === item.leadId) ||
            (lead.email && lead.email.toLowerCase() === item.email.toLowerCase());
          if (isMatch && lead.status === "new") {
            lead.status = "Contacted";
            lead.updatedAt = now;
            lead.touchCount = (lead.touchCount ?? 0) + 1;
            lead.lastContactedAt = now;
            if (!lead.activities) lead.activities = [];
            lead.activities.push({
              id: crypto.randomUUID(),
              type: "email_sent",
              note: `Email sent — Subject: "${item.subject}"`,
              date: now,
              by: "Mike",
            });
            dirty = true;
            break;
          }
        }
        if (dirty) wfs(crmPath, JSON.stringify(crmData, null, 2), "utf-8");
      }
    } catch (crmErr) {
      console.error("CRM update failed:", crmErr);
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Auto-send failed:", message);
    // Keep as pending if send fails — don't block the response
  }

  return Response.json({ item }, { status: 201 });
}

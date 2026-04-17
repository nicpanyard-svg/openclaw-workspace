/**
 * GET /api/mike/stats
 *
 * Aggregates all Mike outreach data into a single, stable response model.
 * The frontend should consume ONLY this endpoint — not queue/inbox directly.
 *
 * Response model is versioned (v1) so breaking changes can be managed cleanly.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const QUEUE_PATH = join(process.cwd(), "data", "mike-outreach-queue.json");

// ── Types ──────────────────────────────────────────────────────────────────

interface QueueItem {
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
}

interface InboxEmail {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: string;
  isRead: boolean;
  leadId?: string;
}

type ReplyType = "hot" | "ooo" | "notfit" | "bounce" | "internal" | "unknown";

// ── Helpers ────────────────────────────────────────────────────────────────

const VERTICAL_MAP: Record<string, string[]> = {
  "Water":        ["water", "utility", "utilities", "municipal", "sewer", "flood", "hydra", "aqua", "wpd", "wwtp"],
  "Public Works": ["public works", "county", "city of", "usace", "usgs", "stormwater", "drainage"],
  "Retail":       ["retail", "walmart", "tractor supply", "best buy", "distribution", "target", "kroger"],
  "Midstream":    ["pipeline", "midstream", "oneok", "targa", "western midstream", "enterprise products", "boardwalk"],
  "EPC":          ["solar", "wind", "epc", "renewable", "wanzek", "aecom", "zachry", "construction"],
};

function getVertical(company: string, subject: string): string {
  const text = (company + " " + subject).toLowerCase();
  for (const [vertical, keywords] of Object.entries(VERTICAL_MAP)) {
    if (keywords.some(k => text.includes(k))) return vertical;
  }
  return "Other";
}

function classifyReply(email: InboxEmail): ReplyType {
  const from = email.from.toLowerCase();
  const subj = email.subject.toLowerCase();
  const body = email.body.replace(/<[^>]+>/g, " ").toLowerCase();

  // Internal / system
  const internalSenders = ["nick.panyard@inetconnected", "microsoftexchange", "msonlineservices", "mssecurity", "no-reply", "noreply"];
  if (internalSenders.some(s => from.includes(s))) return "internal";

  // Bounce
  if (subj.includes("undeliverable") || subj.includes("delivery has failed") || from.includes("mailer-daemon")) return "bounce";

  // OOO
  if (subj.includes("automatic reply") || subj.includes("out of office") || subj.includes("autoreply")) return "ooo";

  // Not a fit
  const notFitPhrases = ["not interested", "unsubscribe", "remove me", "wrong person", "not my area", "traffic signal", "not the right person"];
  if (notFitPhrases.some(p => body.includes(p) || subj.includes(p))) return "notfit";

  // Hot
  const hotPhrases = ["how much", "pricing", "price", "interested", "tell me more", "schedule", "call", "meeting", "demo", "yes", "sounds good", "love to", "can we", "would like"];
  if (hotPhrases.some(p => body.includes(p))) return "hot";

  return "unknown";
}

function buildDailySends(sent: QueueItem[], days = 7) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const label = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    const items = sent.filter(q => {
      const sd = new Date(q.sentAt || q.createdAt);
      return sd.toDateString() === d.toDateString();
    });
    const byVertical: Record<string, number> = {};
    items.forEach(q => {
      const v = getVertical(q.company, q.subject);
      byVertical[v] = (byVertical[v] || 0) + 1;
    });
    return { date: label, count: items.length, byVertical };
  });
}

function buildVerticalStats(sent: QueueItem[], replies: InboxEmail[]) {
  const verticals = ["Water", "Public Works", "Retail", "Midstream", "EPC", "Other"];
  return verticals.map(v => {
    const sentItems = sent.filter(q => getVertical(q.company, q.subject) === v);
    const repliedItems = replies.filter(e => {
      const matched = sent.find(q => q.email.toLowerCase() === e.from.toLowerCase());
      return matched && getVertical(matched.company, matched.subject) === v;
    });
    return {
      vertical: v,
      sent: sentItems.length,
      replied: repliedItems.length,
      responseRate: sentItems.length > 0 ? Math.round((repliedItems.length / sentItems.length) * 1000) / 10 : 0,
    };
  }).filter(v => v.sent > 0);
}

// ── Route Handler ──────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Read queue
    let queue: QueueItem[] = [];
    if (existsSync(QUEUE_PATH)) {
      const raw = readFileSync(QUEUE_PATH, "utf-8");
      queue = JSON.parse(raw).queue ?? [];
    }

    const sent = queue.filter(q => q.status === "sent");
    const pending = queue.filter(q => q.status === "pending");

    const now = Date.now();
    const todayStr = new Date().toDateString();
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    const sentToday = sent.filter(q => new Date(q.sentAt || q.createdAt).toDateString() === todayStr);
    const sentThisWeek = sent.filter(q => now - new Date(q.sentAt || q.createdAt).getTime() < weekMs);

    // 2. Read inbox (last 7 days)
    let rawEmails: InboxEmail[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readInbox } = require("../../../../scripts/ms-graph-email");
      const sevenDaysAgo = new Date(now - weekMs).toISOString();
      rawEmails = await readInbox(`receivedDateTime ge ${sevenDaysAgo}`);
    } catch {
      // Inbox unavailable — continue with empty
    }

    // 3. Classify emails
    const classified = rawEmails.map(e => ({
      ...e,
      type: classifyReply(e),
      vertical: (() => {
        const matched = sent.find(q => q.email.toLowerCase() === e.from.toLowerCase());
        return matched ? getVertical(matched.company, matched.subject) : "Unknown";
      })(),
      matchedLead: sent.find(q => q.email.toLowerCase() === e.from.toLowerCase()) ?? null,
    }));

    const hotReplies    = classified.filter(e => e.type === "hot");
    const oooReplies    = classified.filter(e => e.type === "ooo");
    const notFitReplies = classified.filter(e => e.type === "notfit");
    const bounces       = classified.filter(e => e.type === "bounce");
    const realReplies   = classified.filter(e => !["internal", "bounce"].includes(e.type));

    const responseRate = sent.length > 0
      ? Math.round((realReplies.length / sent.length) * 1000) / 10
      : 0;

    // 4. Build chart data
    const dailySends    = buildDailySends(sent);
    const verticalStats = buildVerticalStats(sent, realReplies);

    // 5. Build funnel
    const funnel = [
      { stage: "Queued",   count: queue.length },
      { stage: "Sent",     count: sent.length },
      { stage: "Replied",  count: realReplies.length },
      { stage: "Hot",      count: hotReplies.length },
    ];

    // 6. Handed off leads
    let crmLeads: Array<{ id: string; name: string; company?: string; email?: string; status: string; activities?: Array<{type:string;note:string;date:string}> }> = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { readFileSync: rfs, existsSync: efs } = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { join: pjoin } = require('path');
      const crmPath = pjoin(process.cwd(), 'data', 'crm-leads.json');
      if (efs(crmPath)) {
        crmLeads = JSON.parse(rfs(crmPath, 'utf-8')).leads ?? [];
      }
    } catch { /* silent */ }

    const handedOff = crmLeads
      .filter(l => l.status === 'Handed Off')
      .map(l => ({
        id: l.id,
        name: l.name,
        company: l.company ?? '',
        email: l.email ?? '',
        status: l.status,
        lastActivity: (l.activities ?? []).slice(-1)[0] ?? null,
      }));

    // 7. Assemble response
    return Response.json({
      _version: "1",
      _updatedAt: new Date().toISOString(),

      summary: {
        totalQueued:      queue.length,
        totalSent:        sent.length,
        sentToday:        sentToday.length,
        sentThisWeek:     sentThisWeek.length,
        pendingApproval:  pending.length,
        hotReplies:       hotReplies.length,
        oooReplies:       oooReplies.length,
        notFitReplies:    notFitReplies.length,
        bounces:          bounces.length,
        handedOff:        handedOff.length,
        responseRate,
      },

      handedOff,
      funnel,
      dailySends,
      verticalStats,

      replies: {
        hot:     hotReplies,
        ooo:     oooReplies,
        notFit:  notFitReplies,
        bounced: bounces,
        all:     realReplies,
      },

      recentSent: [...sent]
        .sort((a, b) => new Date(b.sentAt || b.createdAt).getTime() - new Date(a.sentAt || a.createdAt).getTime())
        .slice(0, 100)
        .map(q => ({
          ...q,
          vertical: getVertical(q.company, q.subject),
          hasReply: rawEmails.some(e => e.from.toLowerCase() === q.email.toLowerCase()),
        })),
    });

  } catch (err) {
    console.error("[mike/stats] error:", err);
    return Response.json({ error: "Failed to load stats", detail: String(err) }, { status: 500 });
  }
}

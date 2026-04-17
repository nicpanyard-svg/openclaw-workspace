import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NextRequest } from "next/server";

const DATA_PATH = join(process.cwd(), "data", "outreach-tracking.json");

export type ContactStatus =
  | "Pending"
  | "Touch1Sent"
  | "Touch2Sent"
  | "Touch3Sent"
  | "Responded"
  | "MeetingBooked"
  | "NotInterested"
  | "Bounced";

export type TouchEntry = {
  touchNumber: number;
  sentAt: string;
  channel: string;
  notes: string;
};

export type Contact = {
  contactId: string;
  name: string;
  title: string;
  company: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: ContactStatus;
  linkedin?: string;
  email?: string;
  mobile?: string;
  touchSequence: TouchEntry[];
  responded: boolean;
  responseDate: string | null;
  responseNotes: string;
  meetingBooked: boolean;
  meetingDate: string | null;
  outcome: string | null;
};

type Campaign = {
  id: string;
  name: string;
  vertical: string;
  sourceFile: string;
  createdAt: string;
  contacts: Contact[];
};

type RawData = { campaigns: Campaign[] | Record<string, Campaign> };

function readCampaigns(): Campaign[] {
  const raw: RawData = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  if (Array.isArray(raw.campaigns)) return raw.campaigns;
  return Object.values(raw.campaigns);
}

function writeCampaigns(campaigns: Campaign[]) {
  writeFileSync(DATA_PATH, JSON.stringify({ campaigns }, null, 2), "utf-8");
}

function computeStats(contacts: Contact[]) {
  const total = contacts.length;
  const pending = contacts.filter((c) => c.status === "Pending").length;
  const bounced = contacts.filter((c) => c.status === "Bounced").length;
  const responded = contacts.filter((c) => c.responded || c.status === "Responded" || c.status === "MeetingBooked").length;
  const meetingsBooked = contacts.filter((c) => c.meetingBooked || c.status === "MeetingBooked").length;
  const notInterested = contacts.filter((c) => c.status === "NotInterested").length;
  const touchesSent = contacts.reduce((s, c) => s + c.touchSequence.length, 0);

  const denom = total - pending - bounced;
  const responseRate = denom > 0 ? Math.round((responded / denom) * 1000) / 10 : 0;
  const meetingRate = responded > 0 ? Math.round((meetingsBooked / responded) * 1000) / 10 : 0;

  const byPriority: Record<string, { sent: number; responded: number; rate: number }> = {};
  for (const p of ["HIGH", "MEDIUM", "LOW"]) {
    const g = contacts.filter((c) => c.priority === p);
    const sent = g.filter((c) => c.status !== "Pending").length;
    const resp = g.filter((c) => c.responded || c.status === "Responded" || c.status === "MeetingBooked").length;
    byPriority[p] = { sent, responded: resp, rate: sent > 0 ? Math.round((resp / sent) * 1000) / 10 : 0 };
  }

  const touchBreakdown = {
    touch1: { sent: contacts.filter((c) => c.touchSequence.length >= 1).length, responded: 0 },
    touch2: { sent: contacts.filter((c) => c.touchSequence.length >= 2).length, responded: 0 },
    touch3: { sent: contacts.filter((c) => c.touchSequence.length >= 3).length, responded: 0 },
  };
  for (const c of contacts) {
    const isResp = c.responded || c.status === "Responded" || c.status === "MeetingBooked";
    if (isResp) {
      const tc = c.touchSequence.length;
      if (tc === 1) touchBreakdown.touch1.responded++;
      else if (tc === 2) touchBreakdown.touch2.responded++;
      else if (tc >= 3) touchBreakdown.touch3.responded++;
    }
  }

  const channelPerformance: Record<string, { sent: number; responded: number }> = {};
  for (const c of contacts) {
    for (const t of c.touchSequence) {
      const ch = t.channel || "Unknown";
      if (!channelPerformance[ch]) channelPerformance[ch] = { sent: 0, responded: 0 };
      channelPerformance[ch].sent++;
    }
    const isResp = c.responded || c.status === "Responded" || c.status === "MeetingBooked";
    if (isResp && c.touchSequence.length > 0) {
      const lastCh = c.touchSequence[c.touchSequence.length - 1].channel || "Unknown";
      if (!channelPerformance[lastCh]) channelPerformance[lastCh] = { sent: 0, responded: 0 };
      channelPerformance[lastCh].responded++;
    }
  }

  return {
    totalContacts: total,
    touchesSent,
    responded,
    meetingsBooked,
    notInterested,
    bounced,
    pending,
    responseRate,
    meetingRate,
    byPriority,
    touchBreakdown,
    channelPerformance,
  };
}

export async function GET() {
  try {
    const campaigns = readCampaigns();
    const result = campaigns.map((c) => ({ ...c, stats: computeStats(c.contacts) }));
    return Response.json({ campaigns: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { campaignId, contactId, update } = body as {
      campaignId: string;
      contactId: string;
      update: Partial<Contact>;
    };

    const campaigns = readCampaigns();
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

    const idx = campaign.contacts.findIndex((c) => c.contactId === contactId);
    if (idx === -1) return Response.json({ error: "Contact not found" }, { status: 404 });

    campaign.contacts[idx] = { ...campaign.contacts[idx], ...update };
    writeCampaigns(campaigns);

    return Response.json({ ok: true, contact: campaign.contacts[idx] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}

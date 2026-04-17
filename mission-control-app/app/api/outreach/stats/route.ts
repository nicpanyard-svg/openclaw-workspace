import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_PATH = join(process.cwd(), "data", "outreach-tracking.json");

export async function GET() {
  if (!existsSync(DATA_PATH)) {
    return Response.json({ error: "No tracking data" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
  // Normalise array or object format
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignList: any[] = Array.isArray(data.campaigns)
    ? data.campaigns
    : Object.values(data.campaigns);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContacts: any[] = campaignList.flatMap((c: any) => c.contacts);

  const total = allContacts.length;
  const sent = allContacts.filter((c) => c.status !== "Pending").length;
  const responded = allContacts.filter(
    (c) => c.responded || c.status === "Responded" || c.status === "MeetingBooked"
  ).length;
  const meetings = allContacts.filter(
    (c) => c.meetingBooked || c.status === "MeetingBooked"
  ).length;

  // Response by touch number (proxy: touchSequence.length when responded)
  const byTouch: Record<number, { total: number; responded: number }> = {
    1: { total: 0, responded: 0 },
    2: { total: 0, responded: 0 },
    3: { total: 0, responded: 0 },
  };
  for (const c of allContacts) {
    const t = c.touchSequence.length;
    for (let i = 1; i <= Math.min(t, 3); i++) {
      byTouch[i].total++;
    }
    if ((c.responded || c.status === "Responded" || c.status === "MeetingBooked") && t > 0) {
      const key = Math.min(t, 3);
      byTouch[key].responded++;
    }
  }

  // By priority
  const byPriority: Record<string, { total: number; responded: number; meetings: number }> = {
    HIGH: { total: 0, responded: 0, meetings: 0 },
    MEDIUM: { total: 0, responded: 0, meetings: 0 },
  };
  for (const c of allContacts) {
    const p: string = c.priority;
    if (byPriority[p]) {
      byPriority[p].total++;
      if (c.responded || c.status === "Responded" || c.status === "MeetingBooked")
        byPriority[p].responded++;
      if (c.meetingBooked || c.status === "MeetingBooked") byPriority[p].meetings++;
    }
  }

  // Per-campaign summary
  const byCampaign: Record<string, { name: string; total: number; sent: number; responded: number; meetings: number }> = {};
  for (const campaign of campaignList as any[]) {
    const id: string = campaign.id;
    const cc: any[] = campaign.contacts;
    byCampaign[id] = {
      name: campaign.name,
      total: cc.length,
      sent: cc.filter((c) => c.status !== "Pending").length,
      responded: cc.filter((c) => c.responded || c.status === "Responded" || c.status === "MeetingBooked").length,
      meetings: cc.filter((c) => c.meetingBooked || c.status === "MeetingBooked").length,
    };
  }

  return Response.json({
    total,
    sent,
    responded,
    meetings,
    responseRate: total > 0 ? Math.round((responded / total) * 100) : 0,
    meetingRate: total > 0 ? Math.round((meetings / total) * 100) : 0,
    byTouch,
    byPriority,
    byCampaign,
  });
}

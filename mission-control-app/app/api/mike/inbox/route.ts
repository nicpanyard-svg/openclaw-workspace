import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CRM_PATH = join(process.cwd(), "data", "crm-leads.json");

const MEETING_KEYWORDS = [
  "meeting", "call", "schedule", "book", "calendar", "zoom", "teams",
  "catch up", "connect", "chat", "discuss", "demo", "intro",
];

interface Lead {
  id: string;
  name: string;
  email?: string;
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

function hasMeetingKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return MEETING_KEYWORDS.some((kw) => lower.includes(kw));
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// GET /api/mike/inbox — fetch unread emails, cross-reference with CRM leads, auto-log activities
export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readInbox, markRead } = require("../../../../scripts/ms-graph-email");
    // Pull last 7 days of emails regardless of read status
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const emails = await readInbox(`receivedDateTime ge ${sevenDaysAgo}`);

    const leads = readLeads();
    let crmDirty = false;

    const enriched = emails.map((email: {
      id: string;
      from: string;
      fromName: string;
      subject: string;
      body: string;
      receivedAt: string;
      isRead: boolean;
    }) => {
      // Match email to a CRM lead by email address
      const matchedLead = leads.find(
        (l) => l.email && l.email.toLowerCase() === email.from.toLowerCase()
      );

      if (matchedLead) {
        const plainBody = stripHtml(email.body);

        // Log email_received activity
        if (!matchedLead.activities) matchedLead.activities = [];

        const alreadyLogged = matchedLead.activities.some(
          (a) => a.type === "email_received" && a.note.includes(email.id)
        );

        if (!alreadyLogged) {
          matchedLead.activities.push({
            id: crypto.randomUUID(),
            type: "email_received",
            note: `[${email.id}] Subject: "${email.subject}" — ${plainBody.slice(0, 200)}`,
            date: email.receivedAt,
            by: matchedLead.name,
          });

          // Flag for follow-up
          matchedLead.followUpDate = new Date().toISOString().split("T")[0];
          matchedLead.updatedAt = new Date().toISOString();

          // Detect meeting intent — hand off to Nick
          const meetingPhrases = ['set up a meeting','schedule a meeting','book a call','schedule a call','set up a call','lets meet','let\'s meet','can we meet','available for a call','available to meet','would love to connect','set up time','find time'];
          const wantsMeeting = meetingPhrases.some(p => plainBody.toLowerCase().includes(p) || email.subject.toLowerCase().includes(p));

          if (wantsMeeting && matchedLead.status !== 'Meeting Booked' && matchedLead.status !== 'Handed Off') {
            matchedLead.status = 'Handed Off';
            matchedLead.followUpDate = new Date().toISOString().split('T')[0];
            matchedLead.activities!.push({
              id: crypto.randomUUID(),
              type: 'handoff',
              note: 'Prospect wants to meet - collecting availability for Nick. Reply: ' + plainBody.slice(0, 200),
              date: new Date().toISOString(),
              by: 'Mike',
            });
            // Queue reply asking for availability — close the meeting fast
            const firstName = matchedLead.name.split(' ')[0];
            fetch('http://localhost:3000/api/mike/queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leadId: matchedLead.id,
                leadName: matchedLead.name,
                company: (matchedLead as { company?: string }).company ?? '',
                email: matchedLead.email,
                subject: 'Re: ' + email.subject,
                body: '<p>Hi ' + firstName + ',</p><p>Great - what does your calendar look like this week or next? A few days and times that work on your end and I will get it on the calendar.</p>',
                status: 'pending',
              }),
            }).catch(() => {/* best-effort */});
            // Send Telegram alert to Nick immediately
            const telegramMsg = '📅 Meeting Request!\n\n' +
              matchedLead.name + ' at ' + ((matchedLead as { company?: string }).company ?? '') + ' wants to meet.\n\n' +
              'They said: ' + plainBody.slice(0, 200) + '\n\n' +
              'Mike has asked for their availability. I\'ll text you their times when they reply.';
            fetch('http://localhost:18789/api/message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer b9a011055d51a7e83e2faa5defcc5686192d4f5d0a4cac39' },
              body: JSON.stringify({ channel: 'telegram', to: '8525960420', text: telegramMsg }),
            }).catch(() => {/* best-effort */});

            // Queue notification to Nick
            fetch('http://localhost:3000/api/mike/queue', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leadId: 'nick-alert',
                leadName: 'Nick Panyard',
                company: 'iNet Internal',
                email: 'nick.panyard@inetlte.com',
                subject: '📅 Meeting Request — ' + matchedLead.name + ' at ' + ((matchedLead as { company?: string }).company ?? ''),
                body: '<p>Hi Nick,</p><p>' + matchedLead.name + ' at ' + ((matchedLead as { company?: string }).company ?? '') + ' wants to schedule a meeting.</p><p>What they said:</p><blockquote>' + plainBody.slice(0, 300) + '</blockquote><p>Mike has replied asking for their availability and will send it to you once received. Mark it done in Mission Control when the meeting is booked.</p>',
                status: 'pending',
              }),
            }).catch(() => {/* best-effort */});
          } else if (
            matchedLead.status === 'new' ||
            matchedLead.status === 'Contacted'
          ) {
            matchedLead.status = 'Responded';
          }

          crmDirty = true;

          // Mark email as read in Graph
          markRead(email.id).catch(() => {/* best-effort */});
        }

        return {
          ...email,
          leadId: matchedLead.id,
          leadName: matchedLead.name,
          company: (matchedLead as { company?: string }).company ?? "",
        };
      }

      return { ...email, leadId: null, leadName: null, company: null };
    });

    if (crmDirty) writeLeads(leads);

    return Response.json({ emails: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}

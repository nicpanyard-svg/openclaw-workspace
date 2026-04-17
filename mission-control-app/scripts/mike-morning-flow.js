#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.MIKE_BASE_URL || 'http://localhost:3000';
const DATA_DIR = path.join(__dirname, '..', 'data');
const CRM_PATH = path.join(DATA_DIR, 'crm-leads.json');
const REPORT_PREFIX = 'mike-daily-report-';

const DEFAULTS = {
  maxFollowUps: Number(process.env.MIKE_MAX_FOLLOWUPS || 8),
  maxFresh: Number(process.env.MIKE_MAX_FRESH || 6),
  maxInboxSummary: Number(process.env.MIKE_MAX_INBOX_SUMMARY || 8),
  dryRun: process.argv.includes('--dry-run'),
  noSend: process.argv.includes('--no-send'),
  verbose: process.argv.includes('--verbose'),
};

function now() {
  return new Date();
}

function todayLocal(date = now()) {
  const cst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return cst;
}

function isWeekday(date = now()) {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  }).format(date);
  return !['Sat', 'Sun'].includes(day);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, 'utf8');
}

function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function titleCaseStatus(status = '') {
  const s = lower(status);
  const map = {
    new: 'New',
    contacted: 'Contacted',
    engaged: 'Engaged',
    responded: 'Responded',
    'meeting booked': 'Meeting Booked',
    'handed off': 'Handed Off',
    'needs info': 'Needs Info',
  };
  return map[s] || status || 'New';
}

function getFirstName(name = '') {
  return String(name).trim().split(/\s+/)[0] || 'there';
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

function getLeads() {
  return readJson(CRM_PATH, { leads: [] }).leads || [];
}

function getQueue() {
  return readJson(path.join(DATA_DIR, 'mike-outreach-queue.json'), { queue: [] }).queue || [];
}

function buildEmailBody(lead, type) {
  const first = getFirstName(lead.name);
  const company = lead.company || 'your team';
  const fit = lead.fit_notes || lead.notes || lead.iNetFit || '';
  const vertical = lead.vertical || 'operations';
  const fitLine = fit
    ? `<p>I took a quick look at ${company} and the fit seems to be around ${escapeHtml(fit).slice(0, 220)}.</p>`
    : '';

  if (type === 'follow_up') {
    return [
      `<p>Hi ${first},</p>`,
      `<p>Wanted to circle back in case this is still relevant on your side.</p>`,
      `<p>We help teams with remote sites, field assets, and hard-to-reach locations use Starlink and private LTE to improve uptime, backup connectivity, and visibility without waiting on a carrier buildout.</p>`,
      fitLine,
      `<p>Open to a short 20-minute conversation to see whether it is worth exploring for ${company}?</p>`,
    ].join('');
  }

  return [
    `<p>Hi ${first},</p>`,
    `<p>I am reaching out because ${company} looks like a practical fit for stronger connectivity across remote operations.</p>`,
    `<p>Infrastructure Networks helps teams use private LTE and Starlink for remote sites, SCADA/OT environments, backup paths, and distributed operations where public connectivity is inconsistent.</p>`,
    fitLine,
    `<p>If that is relevant for your ${vertical.toLowerCase()} work, would you be open to a short 20-minute call?</p>`,
  ].join('');
}

function buildSubject(lead, type) {
  const company = lead.company || 'your team';
  if (type === 'follow_up') return `Following up on connectivity for ${company}`;
  return `Connectivity for ${company}`;
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function summarizeInboxEmails(emails, maxItems) {
  const meaningful = (emails || []).filter((email) => {
    const from = lower(email.from);
    const subject = lower(email.subject);
    if (!from) return false;
    if (from.includes('linkedin.com') || from.includes('noreply')) return false;
    if (from.includes('postmaster@') || from.includes('microsoft')) return subject.includes('undeliverable');
    if (from.includes('nick.panyard@inetconnected.it.com')) return false;
    return true;
  });

  return meaningful.slice(0, maxItems).map((email) => ({
    from: email.from,
    leadName: email.leadName || null,
    company: email.company || null,
    subject: email.subject,
    receivedAt: email.receivedAt,
    preview: stripHtml(email.body).slice(0, 180),
  }));
}

function getLastActivity(lead) {
  const activities = Array.isArray(lead.activities) ? lead.activities : [];
  return activities.length ? activities[activities.length - 1] : null;
}

function hasSentEmailActivityToday(lead, today) {
  return (lead.activities || []).some((activity) => {
    return activity.type === 'email_sent' && String(activity.date || '').slice(0, 10) === today;
  });
}

function shouldSuppressLead(lead) {
  const status = lower(lead.status);
  if (['meeting booked', 'handed off'].includes(status)) return true;

  const lastActivity = getLastActivity(lead);
  const note = lower(lastActivity?.note || '');
  const subject = lower(lastActivity?.subject || '');
  const combined = `${note} ${subject}`;

  const hardStops = [
    'unsubscribe',
    'remove me',
    'not interested',
    'wrong person',
    'work on food product development',
    'nick following up directly',
    'out of office',
    'automatic reply',
  ];

  return hardStops.some((phrase) => combined.includes(phrase));
}

function wasQueuedRecently(queue, lead, today) {
  return queue.some((item) => {
    const sameLead = lead.id && item.leadId && item.leadId === lead.id;
    const sameEmail = lead.email && item.email && lower(item.email) === lower(lead.email);
    if (!(sameLead || sameEmail)) return false;
    return String(item.createdAt || item.sentAt || '').slice(0, 10) === today;
  });
}

function scoreFreshLead(lead) {
  const title = lower(lead.title);
  const company = lower(lead.company);
  const notes = lower(lead.fit_notes || lead.notes || '');
  let score = 0;
  if (lead.email) score += 20;
  if (title.includes('vp') || title.includes('vice president')) score += 10;
  if (title.includes('director')) score += 8;
  if (title.includes('manager')) score += 4;
  if (notes.includes('scada') || notes.includes('remote') || notes.includes('field')) score += 6;
  if (company.includes('energy') || company.includes('utility') || company.includes('water')) score += 4;
  score -= (lead.touchCount || 0) * 2;
  return score;
}

function pickOverdueFollowups(leads, queue, today, limit) {
  return leads
    .filter((lead) => {
      const status = lower(lead.status);
      if (!lead.email) return false;
      if (!lead.followUpDate) return false;
      if (String(lead.followUpDate).slice(0, 10) > today) return false;
      if (!['contacted', 'engaged', 'responded'].includes(status)) return false;
      if (shouldSuppressLead(lead)) return false;
      if (hasSentEmailActivityToday(lead, today)) return false;
      if (wasQueuedRecently(queue, lead, today)) return false;
      return true;
    })
    .sort((a, b) => String(a.followUpDate).localeCompare(String(b.followUpDate)))
    .slice(0, limit)
    .map((lead) => enrichLeadForDraft(lead, 'follow_up'));
}

function pickFreshTargets(leads, queue, today, limit) {
  return leads
    .filter((lead) => {
      const status = lower(lead.status);
      if (!lead.email) return false;
      if (status !== 'new') return false;
      if (shouldSuppressLead(lead)) return false;
      if (hasSentEmailActivityToday(lead, today)) return false;
      if (wasQueuedRecently(queue, lead, today)) return false;
      return true;
    })
    .sort((a, b) => scoreFreshLead(b) - scoreFreshLead(a))
    .slice(0, limit)
    .map((lead) => enrichLeadForDraft(lead, 'first_touch'));
}

function enrichLeadForDraft(lead, touchType) {
  const lastActivity = getLastActivity(lead);
  return {
    ...lead,
    normalizedStatus: titleCaseStatus(lead.status),
    touchType,
    research: {
      fitSummary: lead.fit_notes || lead.notes || lead.iNetFit || '',
      vertical: lead.vertical || '',
      lastActivityType: lastActivity?.type || null,
      lastActivityNote: lastActivity?.note || null,
      lastActivityDate: lastActivity?.date || null,
    },
    draft: {
      leadId: lead.id,
      leadName: lead.name,
      company: lead.company || '',
      email: lead.email,
      subject: buildSubject(lead, touchType),
      body: buildEmailBody(lead, touchType),
      status: 'pending',
      touchType,
    },
  };
}

async function queueDraft(draft, dryRun) {
  if (dryRun) {
    return { queued: false, dryRun: true, item: draft };
  }
  const result = await fetchJson(`${BASE_URL}/api/mike/queue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  return { queued: true, dryRun: false, item: result.item };
}

async function loadInbox() {
  try {
    return await fetchJson(`${BASE_URL}/api/mike/inbox`);
  } catch (error) {
    return { emails: [], error: error.message };
  }
}

async function loadFollowups() {
  try {
    return await fetchJson(`${BASE_URL}/api/mike/followups`);
  } catch (error) {
    return { summary: null, overdue: [], today: [], upcoming: [], error: error.message };
  }
}

function getSentToday(queue, today, draftedLeadIds) {
  return queue.filter((item) => {
    const sentToday = String(item.sentAt || '').slice(0, 10) === today;
    const createdToday = String(item.createdAt || '').slice(0, 10) === today;
    if (!(sentToday || createdToday)) return false;
    if (!draftedLeadIds.has(item.leadId) && !draftedLeadIds.has(item.email)) return false;
    return item.status === 'sent';
  });
}

function reportPathFor(today) {
  return path.join(DATA_DIR, `${REPORT_PREFIX}${today}.txt`);
}

function renderReport(summary) {
  const lines = [];
  lines.push(`Subject: Mike Daily Report — ${summary.today}`);
  lines.push('To: nick.panyard@inetlte.com');
  lines.push('');
  lines.push('Nick,');
  lines.push('');
  lines.push('Here is the morning outreach run from Mike.');
  lines.push('');
  lines.push('M1 inbox triage');
  if (summary.inbox.error) {
    lines.push(`- Inbox scan failed: ${summary.inbox.error}`);
  } else {
    lines.push(`- ${summary.inbox.totalEmails} messages scanned from the last 7 days.`);
    lines.push(`- ${summary.inbox.matchedLeadEmails} were tied to CRM leads.`);
    if (summary.inbox.summary.length) {
      summary.inbox.summary.forEach((item) => {
        const tag = item.leadName ? `${item.leadName} / ${item.company || 'Unknown company'}` : item.from;
        lines.push(`  - ${tag} — ${item.subject}`);
      });
    } else {
      lines.push('- No meaningful prospect replies bubbled up this pass.');
    }
  }
  lines.push('');
  lines.push('M2 overdue follow-up selection');
  lines.push(`- ${summary.followupsPicked.length} overdue follow-ups selected.`);
  summary.followupsPicked.forEach((lead) => {
    lines.push(`  - ${lead.name} — ${lead.company} — due ${lead.followUpDate || 'n/a'}`);
  });
  if (!summary.followupsPicked.length) lines.push('- None selected.');
  lines.push('');
  lines.push('M3 fresh target selection');
  lines.push(`- ${summary.freshPicked.length} fresh targets selected.`);
  summary.freshPicked.forEach((lead) => {
    lines.push(`  - ${lead.name} — ${lead.company} — ${lead.title || 'no title'}`);
  });
  if (!summary.freshPicked.length) lines.push('- None selected.');
  lines.push('');
  lines.push('M4 research / fit pass scaffold');
  lines.push('- Each picked lead was enriched with fit notes, vertical, and last activity context before drafting.');
  lines.push('');
  lines.push('M5 email batch generation');
  lines.push(`- ${summary.drafts.length} drafts built.`);
  summary.drafts.slice(0, 8).forEach((lead) => {
    lines.push(`  - ${lead.draft.touchType}: ${lead.draft.subject} → ${lead.email}`);
  });
  if (summary.drafts.length > 8) lines.push(`  - +${summary.drafts.length - 8} more drafts`);
  lines.push('');
  lines.push('M6 queue submission');
  lines.push(summary.modeLine);
  lines.push(`- ${summary.queueResults.length} submissions actually attempted through /api/mike/queue.`);
  lines.push('');
  lines.push('M7 verification of sent activity');
  lines.push(`- ${summary.sentToday.length} messages show as sent in the Mike queue for this run.`);
  summary.sentToday.forEach((item) => {
    lines.push(`  - ${item.leadName} — ${item.company} — sent ${item.sentAt}`);
  });
  if (!summary.sentToday.length) lines.push('- No same-run sent confirmations found.');
  lines.push('');
  lines.push('M8 short summary');
  lines.push(`- Run status: ${summary.status}`);
  lines.push(`- Follow-ups: ${summary.followupsPicked.length}`);
  lines.push(`- Fresh: ${summary.freshPicked.length}`);
  lines.push(`- Verified sent: ${summary.sentToday.length}`);
  lines.push('');
  lines.push('Notes');
  lines.push('- Uses the live Mike endpoints already in Mission Control, not a parallel queue.');
  lines.push('- Keeps first-touch dedupe by checking today’s queue/send activity before drafting.');
  lines.push('- If you want a non-sending preview, run: node scripts/mike-morning-flow.js --dry-run');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const today = todayLocal();
  const status = {
    ok: true,
    today,
    skipped: false,
  };

  if (!isWeekday()) {
    const message = JSON.stringify({ ok: true, skipped: true, reason: 'weekend', today }, null, 2);
    console.log(message);
    return;
  }

  const inbox = await loadInbox();
  const followupsApi = await loadFollowups();
  const leads = getLeads();
  const queueBefore = getQueue();

  const followupsPicked = pickOverdueFollowups(leads, queueBefore, today, DEFAULTS.maxFollowUps);
  const freshPicked = pickFreshTargets(leads, queueBefore, today, DEFAULTS.maxFresh);
  const drafts = [...followupsPicked, ...freshPicked];

  const queueResults = [];
  for (const lead of drafts) {
    if (DEFAULTS.noSend) break;
    const result = await queueDraft(lead.draft, DEFAULTS.dryRun);
    queueResults.push({
      leadId: lead.id,
      leadName: lead.name,
      email: lead.email,
      company: lead.company,
      touchType: lead.touchType,
      result,
    });
  }

  const queueAfter = getQueue();
  const draftedLeadIds = new Set();
  drafts.forEach((lead) => {
    if (lead.id) draftedLeadIds.add(lead.id);
    if (lead.email) draftedLeadIds.add(lead.email);
  });
  const sentToday = DEFAULTS.dryRun || DEFAULTS.noSend
    ? []
    : getSentToday(queueAfter, today, draftedLeadIds);

  const summary = {
    today,
    status: DEFAULTS.dryRun ? 'dry-run complete' : DEFAULTS.noSend ? 'draft-only selection complete' : 'live run complete',
    modeLine: DEFAULTS.dryRun
      ? '- Dry run only. No emails were queued or sent.'
      : DEFAULTS.noSend
        ? '- Selection and draft generation only. Queue submission skipped with --no-send.'
        : '- Drafts were submitted to the existing Mike queue endpoint and auto-send path.',
    inbox: {
      error: inbox.error || null,
      totalEmails: (inbox.emails || []).length,
      matchedLeadEmails: (inbox.emails || []).filter((email) => email.leadId).length,
      summary: summarizeInboxEmails(inbox.emails || [], DEFAULTS.maxInboxSummary),
    },
    followupsApiSummary: followupsApi.summary || null,
    followupsPicked,
    freshPicked,
    drafts,
    queueResults,
    sentToday,
  };

  const report = renderReport(summary);
  const reportPath = reportPathFor(today);
  writeText(reportPath, report);

  const output = {
    ok: true,
    today,
    inboxCount: summary.inbox.totalEmails,
    inboxMatchedLeadEmails: summary.inbox.matchedLeadEmails,
    overdueAvailable: summary.followupsApiSummary?.overdue ?? null,
    followupsQueued: followupsPicked.length,
    freshQueued: freshPicked.length,
    sentVerified: sentToday.length,
    reportPath,
    mode: DEFAULTS.dryRun ? 'dry-run' : DEFAULTS.noSend ? 'no-send' : 'live',
  };

  console.log(JSON.stringify(output, null, 2));

  if (DEFAULTS.verbose) {
    console.log('\n--- REPORT ---\n');
    console.log(report);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

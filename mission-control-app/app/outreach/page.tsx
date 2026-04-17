"use client";

import { useState, useEffect, useCallback } from "react";

// ── Data Model (mirrors /api/mike/stats v1) ───────────────────────────────

interface StatsReply {
  id: string;
  from: string;
  fromName: string;
  subject: string;
  body: string;
  receivedAt: string;
  type: string;
  vertical: string;
  matchedLead: { leadName: string; company: string; email: string } | null;
}

interface SentItem {
  id: string;
  leadName: string;
  company: string;
  email: string;
  subject: string;
  status: string;
  sentAt?: string;
  createdAt: string;
  vertical: string;
  hasReply: boolean;
}

interface DailyEntry { date: string; count: number; byVertical: Record<string, number> }
interface VerticalStat { vertical: string; sent: number; replied: number; responseRate: number }
interface FunnelStage { stage: string; count: number }

interface HandedOffItem {
  id: string;
  name: string;
  company: string;
  email: string;
  status: string;
  lastActivity: { type: string; note: string; date: string } | null;
}

interface Stats {
  _version: string;
  _updatedAt: string;
  summary: {
    totalQueued: number;
    totalSent: number;
    sentToday: number;
    sentThisWeek: number;
    hotReplies: number;
    oooReplies: number;
    notFitReplies: number;
    bounces: number;
    handedOff: number;
    responseRate: number;
  };
  handedOff: HandedOffItem[];
  funnel: FunnelStage[];
  dailySends: DailyEntry[];
  verticalStats: VerticalStat[];
  replies: { hot: StatsReply[]; ooo: StatsReply[]; notFit: StatsReply[]; bounced: StatsReply[]; all: StatsReply[] };
  recentSent: SentItem[];
}

// ── Colors ────────────────────────────────────────────────────────────────

const VERTICAL_COLORS: Record<string, string> = {
  "Water":        "#29b6f6",
  "Public Works": "#66bb6a",
  "Retail":       "#ffa726",
  "Midstream":    "#ab47bc",
  "EPC":          "#ef5350",
  "Other":        "#78909c",
};

const REPLY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  hot:     { label: "🔥 Interested",  color: "#26a86a", bg: "#182a20" },
  ooo:     { label: "📅 OOO",         color: "#e8a045", bg: "#2a1e08" },
  notfit:  { label: "❌ Not a Fit",   color: "#e05252", bg: "#2a1818" },
  bounce:  { label: "⚫ Bounced",     color: "#55555c", bg: "#1a1a1d" },
  unknown: { label: "📬 Reply",       color: "#5e6ad2", bg: "#1e2142" },
};

const FUNNEL_COLORS = ["#3a3a3f", "#5e6ad2", "#e8a045", "#26a86a"];

// ── Chart Components ──────────────────────────────────────────────────────

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-[12px] text-[#3a3a3f] text-center py-8">No replies yet</div>;
  const r = 56, cx = 72, cy = 72, circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = data
    .filter(d => d.value > 0)
    .map(d => {
      const dash = (d.value / total) * circ;
      const s = { ...d, dash, offset };
      offset += dash;
      return s;
    });
  return (
    <div className="flex items-center gap-5">
      <svg width="144" height="144" viewBox="0 0 144 144" className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a1d" strokeWidth="22" />
        {segs.map((s, i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="22"
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-(s.offset) + circ / 4} />
        ))}
        <text x={cx} y={cy - 7} textAnchor="middle" fill="#e8e8ea" fontSize="20" fontWeight="700">{total}</text>
        <text x={cx} y={cy + 11} textAnchor="middle" fill="#55555c" fontSize="10">replies</text>
      </svg>
      <div className="flex flex-col gap-2 flex-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-[11px] text-[#8b8b91] flex-1">{d.label}</span>
            <span className="text-[13px] font-bold text-[#e8e8ea]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyBarChart({ data }: { data: DailyEntry[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-[110px]">
      {data.map((d, i) => {
        const h = Math.max((d.count / max) * 88, d.count > 0 ? 6 : 2);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            {d.count > 0 && <span className="text-[10px] text-[#55555c] font-mono group-hover:text-[#8b8b91] transition-colors">{d.count}</span>}
            <div className="w-full rounded-t overflow-hidden relative" style={{ height: `${h}px` }}>
              {Object.entries(d.byVertical).map(([v, c]) => (
                <div key={v} className="w-full" style={{ height: `${(c / d.count) * h}px`, backgroundColor: VERTICAL_COLORS[v] || "#3a3a3f" }} />
              ))}
              {d.count === 0 && <div className="w-full h-full bg-[#1a1a1d] rounded" />}
            </div>
            <span className="text-[9px] text-[#3a3a3f] group-hover:text-[#55555c] transition-colors">{d.date}</span>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBarChart({ data }: { data: VerticalStat[] }) {
  const max = Math.max(...data.map(d => d.sent), 1);
  return (
    <div className="space-y-4">
      {data.map((d, i) => {
        const color = VERTICAL_COLORS[d.vertical] || "#78909c";
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] font-semibold" style={{ color }}>{d.vertical}</span>
              <div className="flex items-center gap-3 text-[11px] text-[#55555c]">
                <span>{d.replied} replied</span>
                <span className="text-[#3a3a3f]">/</span>
                <span>{d.sent} sent</span>
                {d.responseRate > 0 && <span className="font-bold" style={{ color }}>{d.responseRate}%</span>}
              </div>
            </div>
            <div className="h-4 bg-[#0d0d0e] rounded-full overflow-hidden">
              <div className="h-full rounded-full flex">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.sent / max) * 100}%`, backgroundColor: color + "30" }} />
              </div>
            </div>
            {d.replied > 0 && (
              <div className="h-4 -mt-4 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(d.replied / max) * 100}%`, backgroundColor: color }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FunnelViz({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map(s => s.count), 1);
  return (
    <div className="flex items-end gap-2">
      {stages.map((s, i) => {
        const h = Math.max((s.count / max) * 100, s.count > 0 ? 8 : 4);
        const color = FUNNEL_COLORS[i] || "#3a3a3f";
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <span className="text-[22px] font-bold" style={{ color }}>{s.count}</span>
            <div className="w-full rounded-t-lg transition-all duration-700"
              style={{ height: `${h}px`, backgroundColor: color + (s.count === 0 ? "20" : "90") }} />
            <span className="text-[11px] text-[#55555c]">{s.stage}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, colorCls }: { label: string; value: string | number; icon: string; colorCls?: string }) {
  return (
    <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[#55555c] uppercase tracking-widest">{label}</span>
        <span className="text-[16px] opacity-40">{icon}</span>
      </div>
      <div className={`text-[32px] font-bold leading-none ${colorCls ?? "text-[#e8e8ea]"}`}>{value}</div>
    </div>
  );
}

// ── Reply Card ────────────────────────────────────────────────────────────

function ReplyCard({ email, onClick }: { email: StatsReply; onClick: () => void }) {
  const cfg = REPLY_CONFIG[email.type] ?? REPLY_CONFIG.unknown;
  const vColor = VERTICAL_COLORS[email.vertical] || "#78909c";
  const body = email.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
  const timeAgo = (() => {
    const diff = Date.now() - new Date(email.receivedAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  })();
  return (
    <div onClick={onClick} className="rounded-xl p-4 border cursor-pointer transition-all hover:scale-[1.01]"
      style={{ backgroundColor: cfg.bg, borderColor: cfg.color + "25" }}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#e8e8ea] truncate">{email.fromName || email.from}</p>
          <p className="text-[11px] truncate" style={{ color: vColor }}>
            {email.matchedLead?.company || email.from}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ color: cfg.color, backgroundColor: cfg.color + "18" }}>{cfg.label}</span>
          <span className="text-[9px] text-[#3a3a3f]">{timeAgo}</span>
        </div>
      </div>
      <p className="text-[11px] text-[#3a3a3f] truncate mb-1.5">{email.subject}</p>
      <p className="text-[12px] text-[#8b8b91] leading-snug line-clamp-2">{body}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

const EMPTY_STATS: Stats = {
  _version: "1", _updatedAt: "",
  summary: { totalQueued: 0, totalSent: 0, sentToday: 0, sentThisWeek: 0, hotReplies: 0, oooReplies: 0, notFitReplies: 0, bounces: 0, handedOff: 0, responseRate: 0 },
  handedOff: [],
  funnel: [],
  dailySends: [],
  verticalStats: [],
  replies: { hot: [], ooo: [], notFit: [], bounced: [], all: [] },
  recentSent: [],
};

export default function OutreachPage() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "meetings" | "replies" | "sent">("overview");
  const [selected, setSelected] = useState<StatsReply | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mike/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError("Could not load outreach data — retrying…");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const { summary, funnel, dailySends, verticalStats, replies, recentSent, handedOff } = stats;

  const donutData = [
    { label: "🔥 Hot / Interested", value: summary.hotReplies,    color: "#26a86a" },
    { label: "📅 Out of Office",    value: summary.oooReplies,    color: "#e8a045" },
    { label: "❌ Not a Fit",        value: summary.notFitReplies, color: "#e05252" },
    { label: "⚫ Bounced",          value: summary.bounces,       color: "#3a3a3f" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-[#0d0d0d]">
      <span className="text-[13px] text-[#55555c]">Loading Mike&apos;s outreach…</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0d0d] pb-16">

      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#e8e8ea] tracking-tight">🎯 Mike&apos;s Outreach</h1>
          <p className="text-[12px] text-[#3a3a3f] mt-0.5">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading…"}
            {" · "}Live — refreshes every 30s
          </p>
        </div>
        <button onClick={load} className="text-[12px] text-[#5e6ad2] hover:text-[#7b8cde] px-3 py-1.5 rounded-lg bg-[#1e2142] transition-colors">↻ Refresh</button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-4 px-4 py-2.5 bg-[#2a1818] border border-[#e05252]/30 rounded-lg text-[12px] text-[#e05252]">{error}</div>
      )}

      {/* KPI Strip */}
      <div className="px-6 grid grid-cols-6 gap-3 mb-5">
        <KpiCard label="Sent Today"     value={summary.sentToday}        icon="📤" />
        <KpiCard label="This Week"      value={summary.sentThisWeek}     icon="📬" colorCls="text-[#5e6ad2]" />
        <KpiCard label="🔥 Hot Replies" value={summary.hotReplies}       icon="🔥" colorCls={summary.hotReplies > 0 ? "text-[#26a86a]" : "text-[#e8e8ea]"} />
        <KpiCard label="📅 Meetings"    value={summary.handedOff ?? 0}   icon="📅" colorCls={(summary.handedOff ?? 0) > 0 ? "text-[#7c3aed]" : "text-[#55555c]"} />
        <KpiCard label="Bounced"        value={summary.bounces}          icon="⚫" colorCls={summary.bounces > 0 ? "text-[#e05252]" : "text-[#55555c]"} />
        <KpiCard label="Response Rate"  value={summary.responseRate + "%"} icon="📊" colorCls={summary.responseRate >= 5 ? "text-[#26a86a]" : "text-[#e8e8ea]"} />
      </div>

      {/* Tabs */}
      <div className="px-6 flex gap-1 border-b border-white/[0.05] mb-5">
        {([
          { key: "overview",  label: "📊 Overview" },
          { key: "meetings",  label: `📅 Meetings${(summary.handedOff ?? 0) > 0 ? ` (${summary.handedOff})` : ''}` },
          { key: "replies",   label: `📬 Replies (${replies.all.length})` },
          { key: "sent",      label: `📤 Sent (${summary.totalSent})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-[13px] font-medium rounded-t-lg transition-colors relative -mb-px ${
              tab === t.key
                ? "text-[#e8e8ea] bg-[#161618] border border-white/[0.06] border-b-[#161618]"
                : "text-[#55555c] hover:text-[#8b8b91]"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="px-6 space-y-4">

          {/* Row 1: Daily chart + Donut */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 bg-[#161618] border border-white/[0.06] rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea] mb-0.5">Emails Sent — Last 7 Days</h2>
              <p className="text-[11px] text-[#55555c] mb-4">Color coded by vertical</p>
              <DailyBarChart data={dailySends} />
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-white/[0.04]">
                {Object.entries(VERTICAL_COLORS).map(([v, c]) => (
                  <span key={v} className="flex items-center gap-1.5 text-[10px] text-[#55555c]">
                    <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: c }} />{v}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea] mb-0.5">Reply Breakdown</h2>
              <p className="text-[11px] text-[#55555c] mb-4">All inbox responses</p>
              <DonutChart data={donutData} />
            </div>
          </div>

          {/* Row 2: Vertical stats + Funnel */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea] mb-0.5">Response Rate by Vertical</h2>
              <p className="text-[11px] text-[#55555c] mb-5">Darker bar = replies, lighter = total sent</p>
              {verticalStats.length > 0
                ? <HorizontalBarChart data={verticalStats} />
                : <p className="text-[12px] text-[#3a3a3f]">No vertical data yet</p>}
            </div>

            <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea] mb-5">Pipeline Funnel</h2>
              <FunnelViz stages={funnel} />
            </div>
          </div>

          {/* Meeting requests — handed off to Nick */}
          {(handedOff?.length ?? 0) > 0 && (
            <div className="rounded-xl p-5 border" style={{ backgroundColor: '#1e1a2e', borderColor: '#7c3aed30' }}>
              <h2 className="text-[14px] font-semibold mb-4" style={{ color: '#7c3aed' }}>📅 Meeting Requests — Nick to Handle</h2>
              <div className="grid grid-cols-2 gap-3">
                {(handedOff ?? []).map(item => (
                  <div key={item.id} className="rounded-lg p-3 border" style={{ backgroundColor: '#16122a', borderColor: '#7c3aed20' }}>
                    <p className="text-[13px] font-semibold text-[#e8e8ea]">{item.name}</p>
                    <p className="text-[11px] mb-2" style={{ color: '#7c3aed' }}>{item.company}</p>
                    {item.lastActivity && (
                      <p className="text-[11px] text-[#8b8b91] line-clamp-2">{item.lastActivity.note.replace('Prospect wants to meet - collecting availability for Nick. Reply: ','')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hot replies */}
          {replies.hot.length > 0 && (
            <div className="bg-[#182a20] border border-[#26a86a]/20 rounded-xl p-5">
              <h2 className="text-[14px] font-semibold text-[#26a86a] mb-4">🔥 Hot Replies — Take Action</h2>
              <div className="grid grid-cols-2 gap-3">
                {replies.hot.map(e => <ReplyCard key={e.id} email={e} onClick={() => setSelected(e)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MEETINGS ── */}
      {tab === "meetings" && (
        <div className="px-6">
          {(handedOff?.length ?? 0) === 0 ? (
            <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-16 text-center">
              <p className="text-[40px] mb-4">✅</p>
              <p className="text-[16px] font-semibold text-[#e8e8ea] mb-2">No meeting requests right now</p>
              <p className="text-[13px] text-[#55555c]">Mike will surface them here the moment a prospect asks to meet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {(handedOff ?? []).map(item => {
                const reply = (item.lastActivity?.note ?? "").replace("Prospect wants to meet - collecting availability for Nick. Reply: ", "");
                return (
                  <div key={item.id} className="rounded-xl p-5 border" style={{ backgroundColor: "#1e1a2e", borderColor: "#7c3aed40" }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[16px] font-semibold text-[#e8e8ea]">{item.name}</p>
                        <p className="text-[12px] mt-0.5" style={{ color: "#7c3aed" }}>{item.company}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-3" style={{ color: "#7c3aed", backgroundColor: "#7c3aed20" }}>Wants to Meet</span>
                    </div>
                    {reply && (
                      <div className="rounded-lg px-4 py-3 mb-4" style={{ backgroundColor: "#16122a" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#7c3aed" }}>What they said</p>
                        <p className="text-[13px] text-[#c8c8ca] leading-snug">{reply.slice(0, 300)}</p>
                      </div>
                    )}
                    {item.email && <p className="text-[11px] text-[#3a3a3f] mb-4">📧 {item.email}</p>}
                    <button
                      onClick={async () => {
                        await fetch("/api/mike/followups", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ leadId: item.id, status: "Meeting Booked", followUpDate: "", notes: "Meeting booked by Nick" }),
                        });
                        load();
                      }}
                      className="w-full py-2.5 rounded-lg text-[13px] font-semibold transition-colors border"
                      style={{ backgroundColor: "#7c3aed20", color: "#7c3aed", borderColor: "#7c3aed40" }}>
                      ✓ Meeting Booked
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── REPLIES ── */}
      {tab === "replies" && (
        <div className="px-6">
          {replies.all.length === 0 ? (
            <div className="bg-[#161618] border border-white/[0.06] rounded-xl p-12 text-center">
              <p className="text-[32px] mb-3">📬</p>
              <p className="text-[14px] text-[#55555c]">No replies yet — check back soon.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {[
                { key: "hot",    label: "🔥 Hot",         items: replies.hot },
                { key: "ooo",    label: "📅 OOO",         items: replies.ooo },
                { key: "notFit", label: "❌ Not a Fit",   items: replies.notFit },
                { key: "bounced",label: "⚫ Bounced",     items: replies.bounced },
              ].filter(g => g.items.length > 0).map(group => (
                <div key={group.key}>
                  <h3 className="text-[11px] font-semibold text-[#55555c] uppercase tracking-widest mb-3">
                    {group.label} ({group.items.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {group.items.map(e => <ReplyCard key={e.id} email={e} onClick={() => setSelected(e)} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SENT ── */}
      {tab === "sent" && (
        <div className="px-6">
          <div className="bg-[#161618] border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {["Name", "Company", "Vertical", "Subject", "Status", "Sent"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#3a3a3f] uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSent.map((item, i) => {
                  const vColor = VERTICAL_COLORS[item.vertical] || "#78909c";
                  return (
                    <tr key={item.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${i % 2 === 1 ? "bg-white/[0.01]" : ""}`}>
                      <td className="px-4 py-2.5 font-medium text-[#e8e8ea] max-w-[140px] truncate">{item.leadName}</td>
                      <td className="px-4 py-2.5 text-[#8b8b91] max-w-[160px] truncate">{item.company}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap"
                          style={{ color: vColor, backgroundColor: vColor + "18" }}>{item.vertical}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#55555c] max-w-[200px] truncate">{item.subject}</td>
                      <td className="px-4 py-2.5">
                        {item.hasReply
                          ? <span className="text-[10px] text-[#e8a045] bg-[#e8a045]/10 px-2 py-0.5 rounded">Replied</span>
                          : <span className="text-[10px] text-[#26a86a] bg-[#26a86a]/10 px-2 py-0.5 rounded">Sent ✓</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#3a3a3f] whitespace-nowrap">
                        {item.sentAt ? new Date(item.sentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {recentSent.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-[#3a3a3f]">No emails sent yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email detail modal */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] max-h-[75vh] bg-[#111113] border border-white/[0.08] rounded-2xl z-50 flex flex-col shadow-2xl">
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between shrink-0">
              <div>
                <p className="text-[15px] font-semibold text-[#e8e8ea]">{selected.fromName || selected.from}</p>
                <p className="text-[11px] text-[#55555c] mt-0.5">{selected.from}</p>
                <p className="text-[11px] text-[#3a3a3f] mt-0.5 italic">{selected.subject}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-[#55555c] hover:text-[#e8e8ea] text-[22px] leading-none ml-4 shrink-0">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-[13px] text-[#8b8b91] leading-relaxed whitespace-pre-wrap">
                {selected.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

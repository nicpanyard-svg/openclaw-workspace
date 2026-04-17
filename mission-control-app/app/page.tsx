"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface CrmSummary {
  total: number;
  byStage: Record<string, number>;
  overdue: number;
}

interface AgentStatus {
  name: string;
  status: "ACTIVE" | "IDLE" | "WARN" | "DOWN";
  currentTask: string;
  lastActive: string;
  blocker: string | null;
  nextStep: string;
}

interface Task {
  id: string;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  createdAt: string;
  completedAt?: string;
  description?: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  progress: number;
  color?: string;
}

interface CodingSession {
  id: string;
  agent: string;
  task: string;
  status: string;
  startedAt: string;
}

const AGENT_EMOJI: Record<string, string> = {
  Ike: "👔", Mike: "🎯", Jill: "💻", Graham: "📈",
  Susan: "📋", "Dr. Phil": "🖥️", Jack: "🌐",
};

const PRIORITY_COLOR: Record<string, string> = {
  P0: "#e05252", P1: "#e8a045", P2: "#8b8b91",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [codingSessions, setCodingSessions] = useState<CodingSession[]>([]);
  const [paperTrades, setPaperTrades] = useState<{ portfolioValue?: number; cash?: number; totalPnl?: number; totalPnlPct?: number; positions?: { ticker: string; pnl: number; pnlPct: number }[]; grahamNote?: string } | null>(null);
  const [dayTrades, setDayTrades] = useState<{ portfolioSize?: number; cash?: number; deployed?: number; positions?: { ticker: string; status: string }[]; trades?: { ticker: string; side: string; time: string }[]; grahamNote?: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [focusNote, setFocusNote] = useState("");
  const [focusEditing, setFocusEditing] = useState(false);
  const [focusDraft, setFocusDraft] = useState("");
  const [calEvents, setCalEvents] = useState<{title:string;agent:string;startHour:number;durationHours:number}[]>([]);
  const [crmSummary, setCrmSummary] = useState<CrmSummary | null>(null);
  const [mikeQueue, setMikeQueue] = useState<{ id: string; leadName: string; company: string; subject: string; status: string; sentAt?: string }[]>([]);
  const [mikeInbox, setMikeInbox] = useState<{ id: string; from: string; subject: string; snippet: string; receivedAt: string }[]>([]);

  // Live clock — ticks every minute
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [agentRes, taskRes, projectRes, sessionRes] = await Promise.all([
        fetch("/api/agent-status"),
        fetch("/api/tasks"),
        fetch("/api/projects"),
        fetch("/api/coding-sessions"),
      ]);
      const [agentData, taskData, projectData, sessionData] = await Promise.all([
        agentRes.json(), taskRes.json(), projectRes.json(), sessionRes.json(),
      ]);
      setAgents(agentData.agents ?? []);
      setTasks(taskData.tasks ?? []);
      setProjects(projectData.projects ?? []);
      setCodingSessions(sessionData.sessions ?? []);
      setLastUpdated(new Date());
    } catch { /* silent */ }

    try {
      const pt = await fetch("/graham-board/paper-trades.json?" + Date.now());
      setPaperTrades(await pt.json());
    } catch { /* silent */ }

    try {
      const dt = await fetch("/api/day-trades");
      setDayTrades(await dt.json());
    } catch { /* silent */ }

    try {
      const fr = await fetch("/api/focus");
      const fd = await fr.json();
      setFocusNote(fd.note ?? "");
    } catch { /* silent */ }

    try {
      const cr = await fetch("/api/calendar");
      const cd = await cr.json();
      const todayDay = new Date().getDay(); // 0=Sun
      const todayEvents = (cd.events ?? []).filter((e: {day:number}) => e.day === todayDay);
      setCalEvents(todayEvents);
    } catch { /* silent */ }

    try {
      const [mqRes, miRes] = await Promise.all([
        fetch("/api/mike/queue"),
        fetch("/api/mike/inbox"),
      ]);
      const mqData = await mqRes.json();
      const miData = await miRes.json();
      setMikeQueue((mqData.queue ?? []).slice(-10).reverse());
      setMikeInbox((miData.inbox ?? []).slice(0, 8));
    } catch { /* silent */ }

    try {
      const crmRes = await fetch("/api/crm");
      const crmData = await crmRes.json();
      const leads: { status: string; followUpDate?: string }[] = crmData.leads ?? [];
      const todayStr = new Date().toISOString().slice(0, 10);
      const byStage: Record<string, number> = {};
      let overdue = 0;
      for (const l of leads) {
        byStage[l.status] = (byStage[l.status] ?? 0) + 1;
        if (l.followUpDate && l.followUpDate.slice(0, 10) < todayStr) overdue++;
      }
      setCrmSummary({ total: leads.length, byStage, overdue });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 15_000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Derived
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const todayStr = now.toISOString().slice(0, 10);
  const todayWins = tasks.filter(t => t.status === "Done" && t.completedAt && t.completedAt.startsWith(todayStr));

  // Activity feed — recent task status changes + agent moves
  const recentActivity = tasks
    .filter(t => t.completedAt || t.createdAt)
    .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime())
    .slice(0, 6)
    .map(t => ({
      icon: t.status === "Done" ? "✅" : t.status === "Blocked" ? "⛔" : t.status === "In Progress" ? "▶️" : "📋",
      text: t.title,
      sub: `${t.assignee} · ${t.status}`,
      time: t.completedAt ?? t.createdAt,
    }));

  const p0Tasks = tasks.filter(t => t.priority === "P0" && t.status !== "Done");
  const inProgressTasks = tasks.filter(t => t.status === "In Progress");
  const blockedTasks = tasks.filter(t => t.status === "Blocked");
  const activeAgents = agents.filter(a => a.status === "ACTIVE");
  const blockedAgents = agents.filter(a => a.blocker);
  const liveSessions = codingSessions.filter(s => s.status === "running");
  const activeProjects = projects.filter(p => p.status === "Active");

  return (
    <div className="min-h-screen bg-[#0f0f10]">
      {/* ── Morning header ── */}
      <div className="px-8 pt-8 pb-6 border-b border-[#2a2a2d]">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[26px] font-bold text-[#e8e8ea] tracking-tight">{greeting}, Nick.</h1>
            <p className="text-[14px] text-[#55555c] mt-1">{dateStr}</p>
          </div>
          <div className="text-right">
            <p className="text-[20px] font-bold text-[#3a3a42] tabular-nums">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            {lastUpdated && <p className="text-[11px] text-[#2a2a2d] mt-0.5">Data synced {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>}
          </div>
        </div>

        {/* Focus note */}
        <div className="mt-4">
          {focusEditing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={focusDraft}
                onChange={e => setFocusDraft(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === "Enter") {
                    await fetch("/api/focus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: focusDraft }) });
                    setFocusNote(focusDraft);
                    setFocusEditing(false);
                  }
                  if (e.key === "Escape") setFocusEditing(false);
                }}
                placeholder="What's your focus today?"
                className="flex-1 bg-[#1a1a1d] border border-[#3a3a3d] rounded-[6px] px-3 py-2 text-[14px] text-[#e8e8ea] outline-none focus:border-[#5e6ad2]"
              />
              <button onClick={async () => {
                await fetch("/api/focus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: focusDraft }) });
                setFocusNote(focusDraft);
                setFocusEditing(false);
              }} className="px-3 py-2 rounded-[6px] bg-[#5e6ad2] text-white text-[13px] font-semibold">Save</button>
              <button onClick={() => setFocusEditing(false)} className="px-3 py-2 rounded-[6px] bg-[#222224] text-[#8b8b91] text-[13px]">Cancel</button>
            </div>
          ) : (
            <button
              onClick={() => { setFocusDraft(focusNote); setFocusEditing(true); }}
              className="flex items-center gap-2 text-[14px] hover:opacity-80 transition-opacity"
            >
              <span className="text-[16px]">🎯</span>
              {focusNote
                ? <span className="text-[#e8e8ea] font-semibold">{focusNote}</span>
                : <span className="text-[#3a3a42] italic">Set today's focus…</span>}
              <span className="text-[11px] text-[#3a3a42] ml-1">✏️</span>
            </button>
          )}
        </div>

        {/* Top alert strip — P0s and blockers */}
        {(p0Tasks.length > 0 || blockedTasks.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {p0Tasks.map(t => (
              <Link key={t.id} href="/tasks" className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[#2e1919] border border-[#702828] text-[#e05252] text-[12px] font-semibold hover:bg-[#3d2020] transition-colors">
                🚨 P0: {t.title}
              </Link>
            ))}
            {blockedTasks.map(t => (
              <Link key={t.id} href="/tasks" className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-[#2e1a0a] border border-[#703800] text-[#e8a045] text-[12px] font-semibold hover:bg-[#3d2410] transition-colors">
                ⛔ Blocked: {t.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="px-8 py-6 grid grid-cols-12 gap-5">

        {/* ── LEFT COLUMN (8) ── */}
        <div className="col-span-8 flex flex-col gap-5">

          {/* Agent pulse */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">Team Right Now</h2>
              <Link href="/office" className="text-[11px] text-[#5e6ad2] hover:underline">Office →</Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {agents.length === 0 && (
                <div className="col-span-2 text-[13px] text-[#55555c] p-4 bg-[#161618] rounded-[8px] border border-[#2a2a2d]">No agent data yet.</div>
              )}
              {agents.map(agent => {
                const emoji = AGENT_EMOJI[agent.name] ?? "👤";
                const dotColor = agent.status === "ACTIVE" ? "#26a86a" : agent.status === "DOWN" ? "#e05252" : agent.status === "WARN" ? "#e8a045" : "#8b8b91";
                return (
                  <div key={agent.name} className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-3 flex items-start gap-3">
                    <div className="relative mt-0.5">
                      <span className="text-[20px]">{emoji}</span>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#161618]" style={{ background: dotColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-[#e8e8ea]">{agent.name}</span>
                        {agent.blocker && <span className="text-[10px] font-bold text-[#e05252] bg-[#2e1919] border border-[#702828] px-1.5 py-0.5 rounded">BLOCKED</span>}
                      </div>
                      <p className="text-[12px] text-[#8b8b91] truncate mt-0.5">
                        {agent.currentTask || "Idle"}
                      </p>
                      {agent.blocker && <p className="text-[11px] text-[#e8a045] mt-1 truncate">⛔ {agent.blocker}</p>}
                    </div>
                    <span className="text-[10px] text-[#3a3a42] shrink-0">{timeAgo(agent.lastActive)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* In progress tasks */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">In Progress ({inProgressTasks.length})</h2>
              <Link href="/tasks" className="text-[11px] text-[#5e6ad2] hover:underline">All Tasks →</Link>
            </div>
            <div className="flex flex-col gap-2">
              {inProgressTasks.length === 0 && (
                <div className="text-[13px] text-[#55555c] p-4 bg-[#161618] rounded-[8px] border border-[#2a2a2d]">Nothing in progress.</div>
              )}
              {inProgressTasks.slice(0, 6).map(t => (
                <div key={t.id} className="rounded-[8px] bg-[#161618] border border-[#1d2042] px-4 py-3 flex items-center gap-3">
                  <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: `${PRIORITY_COLOR[t.priority]}20`, color: PRIORITY_COLOR[t.priority], border: `1px solid ${PRIORITY_COLOR[t.priority]}40` }}>{t.priority}</span>
                  <span className="text-[13px] text-[#e8e8ea] flex-1 truncate">{t.title}</span>
                  <span className="text-[12px] text-[#55555c] shrink-0">👤 {t.assignee}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Projects progress */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">Active Projects</h2>
              <Link href="/projects" className="text-[11px] text-[#5e6ad2] hover:underline">All Projects →</Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {activeProjects.map(p => {
                const color = p.color ?? "#5e6ad2";
                return (
                  <div key={p.id} className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
                    <p className="text-[13px] font-bold text-[#e8e8ea] mb-3">{p.name}</p>
                    <div className="w-full h-2 rounded-full bg-[#2a2a2d] overflow-hidden mb-2">
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.progress}%`, background: color }} />
                    </div>
                    <p className="text-[12px] font-bold" style={{ color }}>{p.progress}%</p>
                  </div>
                );
              })}
              {activeProjects.length === 0 && (
                <div className="col-span-2 text-[13px] text-[#55555c] p-4 bg-[#161618] rounded-[8px] border border-[#2a2a2d]">No active projects.</div>
              )}
            </div>
          </section>
        </div>

        {/* ── RIGHT COLUMN (4) ── */}
        <div className="col-span-4 flex flex-col gap-5">

          {/* Today's Wins */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">Today's Wins</h2>
              <span className="text-[11px] font-bold text-[#26a86a]">{todayWins.length} done</span>
            </div>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
              {todayWins.length === 0 ? (
                <p className="text-[13px] text-[#55555c]">Nothing closed yet today.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {todayWins.map(t => (
                    <div key={t.id} className="flex items-start gap-2">
                      <span className="text-[14px] mt-0.5">✅</span>
                      <div>
                        <p className="text-[12px] font-semibold text-[#e8e8ea] leading-snug">{t.title}</p>
                        <p className="text-[11px] text-[#55555c]">{t.assignee}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* CRM Widget */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">CRM Pipeline</h2>
              <Link href="/crm" className="text-[11px] text-[#5e6ad2] hover:underline">Open CRM →</Link>
            </div>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
              {!crmSummary ? (
                <p className="text-[13px] text-[#55555c]">Loading…</p>
              ) : crmSummary.total === 0 ? (
                <p className="text-[13px] text-[#55555c]">No leads yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[22px] font-bold text-[#e8e8ea]">{crmSummary.total}</span>
                    <span className="text-[11px] text-[#55555c]">total leads</span>
                  </div>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {["New","Contacted","Responded","Meeting Set","Closed"].map((s) => {
                      const count = crmSummary.byStage[s] ?? 0;
                      if (count === 0) return null;
                      const dotColors: Record<string,string> = { New:"#55555c", Contacted:"#5e6ad2", Responded:"#26a86a", "Meeting Set":"#e8a045", Closed:"#26a86a" };
                      return (
                        <div key={s} className="flex items-center gap-2 text-[12px]">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColors[s] }} />
                          <span className="text-[#8b8b91] flex-1">{s}</span>
                          <span className="font-semibold text-[#e8e8ea]">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                  {crmSummary.overdue > 0 && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-[5px] bg-[#2e1919] border border-[#702828]">
                      <span className="text-[12px]">⚠</span>
                      <span className="text-[12px] text-[#e05252] font-semibold">{crmSummary.overdue} overdue follow-up{crmSummary.overdue > 1 ? "s" : ""}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Activity Feed */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c] mb-3">Recent Activity</h2>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
              {recentActivity.length === 0 ? (
                <p className="text-[13px] text-[#55555c]">No recent activity.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {recentActivity.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[14px] mt-0.5 shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-[#e8e8ea] leading-snug truncate">{item.text}</p>
                        <p className="text-[11px] text-[#55555c]">{item.sub} · {timeAgo(item.time)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Mike — Queue & Inbox */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">🎯 Mike — Outreach</h2>
              <Link href="/outreach" className="text-[11px] text-[#5e6ad2] hover:underline">Full View →</Link>
            </div>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4 space-y-4">
              {/* Queue */}
              <div>
                <p className="text-[10px] font-semibold text-[#55555c] uppercase tracking-widest mb-2">Recent Queue ({mikeQueue.length})</p>
                {mikeQueue.length === 0 ? (
                  <p className="text-[12px] text-[#3a3a3f]">No emails queued.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {mikeQueue.slice(0, 5).map(item => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.status === "sent" ? "bg-[#26a86a]" : item.status === "pending" ? "bg-[#e8a045]" : "bg-[#55555c]"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-[#e8e8ea] font-medium truncate">{item.leadName} <span className="text-[#55555c] font-normal">· {item.company}</span></p>
                          <p className="text-[11px] text-[#55555c] truncate">{item.subject}</p>
                        </div>
                        <span className={`text-[10px] font-bold shrink-0 ${item.status === "sent" ? "text-[#26a86a]" : "text-[#e8a045]"}`}>{item.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Inbox */}
              <div className="border-t border-white/[0.04] pt-3">
                <p className="text-[10px] font-semibold text-[#55555c] uppercase tracking-widest mb-2">Inbox Replies ({mikeInbox.length})</p>
                {mikeInbox.length === 0 ? (
                  <p className="text-[12px] text-[#3a3a3f]">No replies yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {mikeInbox.slice(0, 4).map(item => (
                      <div key={item.id} className="flex items-start gap-2">
                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 bg-[#5e6ad2]" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-[#e8e8ea] font-medium truncate">{item.from}</p>
                          <p className="text-[11px] text-[#55555c] truncate">{item.subject}</p>
                          {item.snippet && <p className="text-[10px] text-[#3a3a3f] truncate">{item.snippet}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Graham snapshot */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">Graham</h2>
              <Link href="/stocks" className="text-[11px] text-[#5e6ad2] hover:underline">Graham Board →</Link>
            </div>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
              {!paperTrades ? (
                <p className="text-[13px] text-[#55555c]">Loading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] text-[#55555c] uppercase tracking-wider mb-1">Portfolio</p>
                      <p className="text-[18px] font-bold text-[#e8e8ea]">${(paperTrades.portfolioValue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#55555c] uppercase tracking-wider mb-1">Total P&L</p>
                      <p className="text-[18px] font-bold" style={{ color: (paperTrades.totalPnl ?? 0) >= 0 ? "#26a86a" : "#e05252" }}>
                        {(paperTrades.totalPnl ?? 0) >= 0 ? "+" : ""}${Math.abs(paperTrades.totalPnl ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {(paperTrades.positions ?? []).length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-[10px] text-[#55555c] uppercase tracking-wider">Open Positions</p>
                      {(paperTrades.positions ?? []).map(p => (
                        <div key={p.ticker} className="flex items-center justify-between text-[12px]">
                          <span className="font-bold text-[#e8e8ea]">{p.ticker}</span>
                          <span style={{ color: p.pnl >= 0 ? "#26a86a" : "#e05252" }}>{p.pnl >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#55555c]">No open positions</p>
                  )}
                  {paperTrades.grahamNote && (
                    <details className="mt-3">
                      <summary className="text-[11px] text-[#55555c] cursor-pointer hover:text-[#8b8b91] select-none">Graham's note ▼</summary>
                      <p className="text-[11px] text-[#55555c] mt-1.5 leading-relaxed">{paperTrades.grahamNote}</p>
                    </details>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Day Trading */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">Day Trading</h2>
              <Link href="/stocks" className="text-[11px] text-[#e8a045] hover:underline">Board →</Link>
            </div>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
              {!dayTrades ? (
                <p className="text-[13px] text-[#55555c]">Loading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] text-[#55555c] uppercase tracking-wider mb-1">Capital</p>
                      <p className="text-[18px] font-bold text-[#e8e8ea]">${(dayTrades.portfolioSize ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#55555c] uppercase tracking-wider mb-1">Deployed</p>
                      <p className="text-[18px] font-bold text-[#818cf8]">${(dayTrades.deployed ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                  {(dayTrades.positions ?? []).filter(p => p.status === "OPEN").length > 0 ? (
                    <div className="flex flex-col gap-1.5 mb-2">
                      <p className="text-[10px] text-[#55555c] uppercase tracking-wider">Open Positions</p>
                      {(dayTrades.positions ?? []).filter(p => p.status === "OPEN").map(p => (
                        <div key={p.ticker} className="text-[12px] font-bold text-[#e8e8ea]">{p.ticker}</div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#55555c]">No open positions</p>
                  )}
                  {dayTrades.grahamNote && (
                    <p className="text-[11px] text-[#55555c] mt-2 leading-relaxed line-clamp-2">{dayTrades.grahamNote}</p>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Code Room */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c]">Code Room</h2>
              {liveSessions.length > 0 && (
                <span className="text-[11px] font-bold text-[#26a86a] animate-pulse">● {liveSessions.length} live</span>
              )}
            </div>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4">
              {liveSessions.length === 0 ? (
                <p className="text-[13px] text-[#55555c]">No active sessions.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {liveSessions.map(s => (
                    <div key={s.id} className="flex items-start gap-2">
                      <span className="text-[16px]">{s.agent.toLowerCase().includes("graham") ? "📈" : "🤖"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-[#e8e8ea]">{s.agent}</p>
                        <p className="text-[11px] text-[#8b8b91] truncate">{s.task}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* System health */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c] mb-3">System</h2>
            <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-4 flex flex-col gap-2">
              {[
                { label: "Gateway", ok: true },
                { label: "Mission Control", ok: true },
                { label: "Memory Search", ok: true },
                { label: "GPT-4o Fallback", ok: true },
                { label: "Agents", ok: agents.length > 0 && !agents.some(a => a.status === "DOWN") },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${item.ok ? "bg-[#26a86a]" : "bg-[#e05252]"}`} />
                  <span className="text-[12px] text-[#8b8b91]">{item.label}</span>
                  <span className="ml-auto text-[11px]" style={{ color: item.ok ? "#26a86a" : "#e05252" }}>{item.ok ? "OK" : "DOWN"}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Quick links */}
          <section>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#55555c] mb-3">Quick Links</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { href: "/tasks", label: "Tasks", icon: "☰" },
                { href: "/sales", label: "Sales", icon: "◈" },
                { href: "/stocks", label: "Stocks", icon: "📈" },
                { href: "/office", label: "Office", icon: "🏢" },
                { href: "/projects", label: "Projects", icon: "◆" },
                { href: "/team", label: "Team", icon: "👥" },
              ].map(link => (
                <Link key={link.href} href={link.href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[6px] bg-[#161618] border border-[#2a2a2d] text-[12px] font-semibold text-[#8b8b91] hover:text-[#e8e8ea] hover:border-[#3a3a3d] transition-colors">
                  <span className="text-[14px]">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

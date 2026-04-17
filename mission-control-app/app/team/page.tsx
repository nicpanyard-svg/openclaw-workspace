"use client";

import { useEffect, useState, useCallback } from "react";

const MISSION =
  "Build, sell, and scale iNet's business through a disciplined AI workforce — one that handles market intelligence, product delivery, sales development, and system reliability so Nick can focus on the decisions that only he can make.";

interface LiveStatus {
  name: string;
  status: "ACTIVE" | "IDLE" | "WARN" | "DOWN";
  currentTask: string;
  lastActive: string;
  blocker: string | null;
  nextStep: string;
}

interface Agent {
  name: string;
  slug: string;
  role: string;
  department: string;
  description: string;
  reports: string;
  color: string;
  emoji: string;
  tags: string[];
  status: "ACTIVE" | "IDLE" | "WARN" | "DOWN";
  since: string; // joined/active since
}

interface Task {
  id: string;
  title: string;
  assignee: string;
  priority: "P0" | "P1" | "P2";
  label: string;
  status: "Backlog" | "In Progress" | "Blocked" | "Done";
  description: string;
  createdAt: string;
  completedAt?: string;
}

const AGENTS: Agent[] = [
  {
    name: "Ike",
    slug: "ike",
    role: "Chief of Staff",
    department: "Orchestration",
    description:
      "Orchestrates the team, handles personal assistance, sales dev, and is the steady hand holding it all together.",
    reports: "nick",
    color: "#5e6ad2",
    emoji: "🧠",
    tags: ["Orchestration", "Sales Dev", "Personal Assistant"],
    status: "ACTIVE",
    since: "2026-03-01",
  },
  {
    name: "Graham",
    slug: "graham",
    role: "Market Analyst",
    department: "Finance",
    description:
      "Daily stock board, pre-market scans, paper trading, and weekly market analysis. Eyes on the market.",
    reports: "ike",
    color: "#eab308",
    emoji: "📈",
    tags: ["Market Analysis", "Paper Trading", "Reporting"],
    status: "ACTIVE",
    since: "2026-03-10",
  },
  {
    name: "Jill",
    slug: "jill",
    role: "Lead Engineer",
    department: "Product",
    description:
      "Product builder for iNet World. Frontend, backend, integrations, shipping. Turns plans into working software.",
    reports: "ike",
    color: "#a855f7",
    emoji: "🔨",
    tags: ["Frontend", "Backend", "Integrations"],
    status: "ACTIVE",
    since: "2026-03-05",
  },
  {
    name: "Jack",
    slug: "jack",
    role: "Systems Engineer",
    department: "Infrastructure",
    description:
      "Browser automation, systems stability, and anything that needs a real browser or scripting layer.",
    reports: "ike",
    color: "#3b82f6",
    emoji: "🖥️",
    tags: ["Automation", "Browser", "Stability"],
    status: "WARN",
    since: "2026-03-15",
  },
  {
    name: "Susan",
    slug: "susan",
    role: "Project Manager",
    department: "Operations",
    description:
      "Weekly priority alignment, agent coordination, project sequencing. Right things in the right order.",
    reports: "ike",
    color: "#06b6d4",
    emoji: "🗂️",
    tags: ["Planning", "Sequencing", "Coordination"],
    status: "ACTIVE",
    since: "2026-03-08",
  },
  {
    name: "Dr. Phil",
    slug: "drphil",
    role: "Reliability Engineer",
    department: "Infrastructure",
    description:
      "System health monitoring, deep audits, proactive reliability fixes. Finds problems before they become outages.",
    reports: "ike",
    color: "#22c55e",
    emoji: "🩺",
    tags: ["Monitoring", "Audits", "Reliability"],
    status: "ACTIVE",
    since: "2026-03-12",
  },
  {
    name: "Mike",
    slug: "mike",
    role: "SDR",
    department: "Sales",
    description:
      "Lead research, outreach drafts, offer mapping, pipeline tracking. Keeps the right doors getting knocked on.",
    reports: "ike",
    color: "#f59e0b",
    emoji: "📣",
    tags: ["Lead Research", "Outreach", "Pipeline"],
    status: "ACTIVE",
    since: "2026-03-18",
  },
];

const PRIORITY_COLOR: Record<string, string> = {
  P0: "#e05252",
  P1: "#e8a045",
  P2: "#55555c",
};

const COL_COLOR: Record<string, string> = {
  Backlog: "#55555c",
  "In Progress": "#5e6ad2",
  Blocked: "#e05252",
  Done: "#26a86a",
};

// Activity feed derived from tasks
function buildActivity(tasks: Task[]) {
  const events: { date: string; text: string; agent: string; type: "done" | "started" | "added" }[] = [];
  for (const t of tasks) {
    if (t.completedAt) {
      events.push({ date: t.completedAt, text: `Completed "${t.title}"`, agent: t.assignee, type: "done" });
    }
    events.push({ date: t.createdAt, text: `Task added: "${t.title}"`, agent: t.assignee, type: "added" });
    if (t.status === "In Progress" && !t.completedAt) {
      events.push({ date: t.createdAt, text: `Started "${t.title}"`, agent: t.assignee, type: "started" });
    }
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
}

const STATUS_STYLES: Record<string, { dot: string; label: string; bg: string }> = {
  ACTIVE: { dot: "bg-[#26a86a]", label: "text-[#26a86a]", bg: "bg-[#26a86a]/10" },
  IDLE:   { dot: "bg-[#8b8b91]", label: "text-[#8b8b91]", bg: "bg-[#8b8b91]/10" },
  WARN:   { dot: "bg-[#e8a045]", label: "text-[#e8a045]", bg: "bg-[#e8a045]/10" },
  DOWN:   { dot: "bg-[#e05252]", label: "text-[#e05252]", bg: "bg-[#e05252]/10" },
};

export default function TeamPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveStatus[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchStatus = useCallback(() => {
    fetch("/api/agent-status")
      .then((r) => r.json())
      .then((data) => {
        setLiveStatus(data.agents ?? []);
        setLastUpdated(data.lastUpdated ?? null);
      })
      .catch(() => {});
  }, []);

  const fetchTasks = useCallback(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((data) => setTasks(Array.isArray(data) ? data : (data.tasks ?? [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus();
      fetchTasks();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchTasks]);

  // Merge live status into static agent data
  const agents = AGENTS.map((a) => {
    const live = liveStatus.find((s) => s.name.toLowerCase() === a.name.toLowerCase());
    return live ? { ...a, status: live.status } : a;
  });

  const agentTasks = (agent: Agent) => tasks.filter((t) => t.assignee === agent.name);
  const activity = buildActivity(tasks);
  const filteredActivity = selectedAgent
    ? activity.filter((e) => e.agent.toLowerCase() === selectedAgent.toLowerCase())
    : activity;

  const activeCount = agents.filter((a) => a.status === "ACTIVE").length;
  const warnCount = agents.filter((a) => a.status === "WARN").length;

  return (
    <div className="p-8 max-w-[1300px]">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[#e8e8ea] mb-1">Team</h1>
          <p className="text-[13px] text-[#55555c]">
            {agents.length} agents · {activeCount} active
            {warnCount > 0 && ` · ${warnCount} warn`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] text-[#55555c]">
              Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <StatusBadge status="ACTIVE" label={`${activeCount} active`} />
          {warnCount > 0 && <StatusBadge status="WARN" label={`${warnCount} warn`} />}
        </div>
      </div>

      {/* Mission */}
      <div className="mb-10 rounded-[10px] border border-[#5e6ad2]/25 bg-[#5e6ad2]/05 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5e6ad2] mb-2">Mission</p>
        <p className="text-[14px] text-[#c8c8cc] leading-relaxed max-w-[800px]">{MISSION}</p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6">
        {/* Left: Agent Cards */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#55555c] mb-4">
            Roster
          </p>
          <div className="flex flex-col gap-3">
            {agents.map((agent) => {
              const myTasks = agentTasks(agent);
              const done = myTasks.filter((t) => t.status === "Done").length;
              const inProgress = myTasks.filter((t) => t.status === "In Progress").length;
              const backlog = myTasks.filter((t) => t.status === "Backlog").length;
              const active = selectedAgent === agent.name;

              return (
                <button
                  key={agent.name}
                  onClick={() => setSelectedAgent(active ? null : agent.name)}
                  className="text-left w-full rounded-[10px] border bg-[#1c1c1f] px-5 py-4 transition-all hover:bg-[#222226]"
                  style={{ borderColor: active ? `${agent.color}60` : "#2a2a2d" }}
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div
                      className="w-10 h-10 rounded-[8px] flex items-center justify-center text-[20px] shrink-0 mt-0.5"
                      style={{ backgroundColor: `${agent.color}18` }}
                    >
                      {agent.emoji}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-semibold text-[#e8e8ea]">{agent.name}</span>
                        <span className="text-[11px]" style={{ color: agent.color }}>{agent.role}</span>
                        <StatusPill status={agent.status} />
                        <span className="ml-auto text-[9px] px-2 py-0.5 rounded border border-[#2a2a2d] text-[#55555c] uppercase tracking-wide">
                          {agent.department}
                        </span>
                      </div>
                      <p className="text-[12px] text-[#8b8b91] leading-relaxed mb-3">{agent.description}</p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {agent.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] px-2 py-0.5 rounded"
                            style={{ backgroundColor: `${agent.color}12`, color: `${agent.color}cc` }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>

                      {/* Task ownership bar */}
                      <div className="flex items-center gap-4">
                        <TaskStat label="Done" count={done} color="#26a86a" />
                        <TaskStat label="Active" count={inProgress} color="#5e6ad2" />
                        <TaskStat label="Backlog" count={backlog} color="#55555c" />
                        {myTasks.length > 0 && (
                          <div className="ml-auto flex-1 max-w-[120px]">
                            <TaskBar done={done} inProgress={inProgress} backlog={backlog} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded tasks */}
                  {active && myTasks.length > 0 && (
                    <div className="mt-4 border-t border-[#2a2a2d] pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#55555c] mb-3">
                        Tasks
                      </p>
                      <div className="flex flex-col gap-2">
                        {myTasks.map((t) => (
                          <div key={t.id} className="flex items-center gap-3 py-1.5">
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: COL_COLOR[t.status] }}
                            />
                            <span className="text-[12px] text-[#c8c8cc] flex-1">{t.title}</span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ color: COL_COLOR[t.status], backgroundColor: `${COL_COLOR[t.status]}15` }}
                            >
                              {t.status}
                            </span>
                            <span
                              className="text-[10px] w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: PRIORITY_COLOR[t.priority] }}
                              title={t.priority}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Activity Feed */}
        <div className="w-[300px] shrink-0">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#55555c]">
              Activity
            </p>
            {selectedAgent && (
              <button
                onClick={() => setSelectedAgent(null)}
                className="text-[10px] text-[#5e6ad2] hover:text-[#7b87e0] transition-colors"
              >
                Clear filter ×
              </button>
            )}
          </div>
          <div className="flex flex-col gap-0">
            {filteredActivity.length === 0 && (
              <p className="text-[12px] text-[#55555c]">No activity yet.</p>
            )}
            {filteredActivity.map((ev, i) => {
              const agent = agents.find((a) => a.name.toLowerCase() === ev.agent.toLowerCase());
              return (
                <div key={i} className="flex gap-3 relative pb-5">
                  {/* Timeline line */}
                  {i < filteredActivity.length - 1 && (
                    <div className="absolute left-[14px] top-[28px] bottom-0 w-px bg-[#2a2a2d]" />
                  )}
                  {/* Avatar dot */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] shrink-0 z-10"
                    style={{ backgroundColor: agent ? `${agent.color}20` : "#2a2a2d" }}
                  >
                    {agent?.emoji ?? "•"}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[12px] text-[#c8c8cc] leading-snug">{ev.text}</p>
                      <ActivityTypePill type={ev.type} />
                    </div>
                    <p className="text-[10px] text-[#55555c] mt-1">
                      {ev.agent} · {ev.date}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "ACTIVE" | "WARN" | "DOWN" | string }) {
  const s = STATUS_STYLES[status as "ACTIVE" | "WARN" | "DOWN"] ?? STATUS_STYLES["WARN"];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.bg} ${s.label}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status.toLowerCase()}
    </span>
  );
}

function StatusBadge({ status, label }: { status: "ACTIVE" | "WARN" | "DOWN"; label: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium ${s.bg} ${s.label}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

function TaskStat({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[13px] font-semibold" style={{ color }}>
        {count}
      </span>
      <span className="text-[10px] text-[#55555c]">{label}</span>
    </div>
  );
}

function TaskBar({ done, inProgress, backlog }: { done: number; inProgress: number; backlog: number }) {
  const total = done + inProgress + backlog;
  if (total === 0) return null;
  const pDone = (done / total) * 100;
  const pIn = (inProgress / total) * 100;
  const pBack = (backlog / total) * 100;
  return (
    <div className="h-1.5 rounded-full overflow-hidden flex bg-[#2a2a2d]">
      <div style={{ width: `${pDone}%`, backgroundColor: "#26a86a" }} />
      <div style={{ width: `${pIn}%`, backgroundColor: "#5e6ad2" }} />
      <div style={{ width: `${pBack}%`, backgroundColor: "#2e2e35" }} />
    </div>
  );
}

function ActivityTypePill({ type }: { type: "done" | "started" | "added" }) {
  const styles = {
    done:    { label: "done",    color: "#26a86a" },
    started: { label: "started", color: "#5e6ad2" },
    added:   { label: "added",   color: "#55555c" },
  };
  const s = styles[type];
  return (
    <span
      className="shrink-0 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
      style={{ color: s.color, backgroundColor: `${s.color}18` }}
    >
      {s.label}
    </span>
  );
}

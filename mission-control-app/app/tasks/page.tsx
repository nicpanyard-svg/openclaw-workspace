"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Task, TaskMessage } from "../api/tasks/route";
import type { CodingSession } from "../api/coding-sessions/route";

type Status = Task["status"];
type Priority = Task["priority"];

const COLUMNS: Status[] = ["Backlog", "In Progress", "Blocked", "Done"];
const ASSIGNEES = ["Susan", "Jill", "Dr Phil", "Mike", "Graham", "Ike", "Unassigned"];
const PRIORITIES: Priority[] = ["P0", "P1", "P2"];
const PROJECTS = ["All Projects", "OpenClaw Stability", "HydraGauge Launch", "Mission Control", "Graham Stock Board", "General"];

// Big, obvious status styles for Nick
const STATUS_STYLE: Record<Status, { bg: string; text: string; border: string }> = {
  Backlog:       { bg: "#222224", text: "#9b9ba1", border: "#3a3a3d" },
  "In Progress": { bg: "#1b2042", text: "#8b95e8", border: "#3a4080" },
  Blocked:       { bg: "#2e1919", text: "#e06060", border: "#702828" },
  Done:          { bg: "#172b1e", text: "#2ec97a", border: "#1e5a38" },
};

const PRIORITY_STYLE: Record<Priority, string> = {
  P0: "bg-[#e05252]/20 text-[#e05252] border border-[#e05252]/40",
  P1: "bg-[#e8a045]/20 text-[#e8a045] border border-[#e8a045]/40",
  P2: "bg-[#8b8b91]/20 text-[#8b8b91] border border-[#8b8b91]/40",
};

// The logical "next" status for a quick one-click advance
const NEXT_STATUS: Record<Status, Status | null> = {
  Backlog:       "In Progress",
  "In Progress": "Done",
  Blocked:       "In Progress",
  Done:          null,
};

const EMPTY_FORM = {
  title: "",
  description: "",
  assignee: "Unassigned",
  priority: "P1" as Priority,
  status: "Backlog" as Status,
  dueDate: "",
};

function getTaskProject(task: Task) {
  const text = `${task.title} ${task.description} ${task.notes ?? ""}`.toLowerCase();
  if (text.includes("hydragauge")) return "HydraGauge Launch";
  if (text.includes("graham") || text.includes("stock")) return "Graham Stock Board";
  if (text.includes("mission control")) return "Mission Control";
  if (text.includes("openclaw") || text.includes("gateway") || text.includes("tailscale") || text.includes("memory")) return "OpenClaw Stability";
  return "General";
}

function hasUnreadForNick(task: Task) {
  const last = task.messages?.[task.messages.length - 1];
  return last?.from === "ike";
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [archivedTasks, setArchivedTasks] = useState<Task[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [onlyMyTasks, setOnlyMyTasks] = useState(false);
  const [codingSessions, setCodingSessions] = useState<CodingSession[]>([]);
  const [showCodeRoom, setShowCodeRoom] = useState(false);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks);
    setRefreshedAt(new Date());
    setLoading(false);
  }, []);

  const fetchArchived = useCallback(async () => {
    const res = await fetch("/api/tasks?archived=true");
    const data = await res.json();
    setArchivedTasks(data.tasks);
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30_000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch("/api/coding-sessions");
        const data = await res.json();
        setCodingSessions(data.sessions ?? []);
      } catch { /* silent */ }
    };
    fetchSessions();
    const iv = setInterval(fetchSessions, 10_000);
    return () => clearInterval(iv);
  }, []);

  const liveSessions = codingSessions.filter((s) => s.status === "running");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSubmitting(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm(EMPTY_FORM);
    setShowForm(false);
    setSubmitting(false);
    fetchTasks();
  }

  async function handleUpdate(id: string, updates: { status?: Status; notes?: string; assignee?: string; dueDate?: string }) {
    await fetch("/api/tasks/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    fetchTasks();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    fetchTasks();
  }

  const filteredTasks = tasks.filter((task) => {
    const haystack = `${task.title} ${task.description} ${task.notes ?? ""}`.toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.toLowerCase());
    const matchesAssignee = assigneeFilter === "All" || task.assignee === assigneeFilter;
    const matchesPriority = priorityFilter === "All" || task.priority === priorityFilter;
    const matchesProject = projectFilter === "All Projects" || getTaskProject(task) === projectFilter;
    const matchesMine = !onlyMyTasks || task.assignee === "Ike";
    return matchesSearch && matchesAssignee && matchesPriority && matchesProject && matchesMine;
  });

  const unreadCount = filteredTasks.filter(hasUnreadForNick).length;
  const columnTasks = (col: Status) => filteredTasks.filter((t) => t.status === col);
  const projectRollups = PROJECTS.filter((p) => p !== "All Projects").map((project) => {
    const items = tasks.filter((t) => getTaskProject(t) === project && !t.archived);
    const done = items.filter((t) => t.status === "Done").length;
    const total = items.length;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    const blocked = items.filter((t) => t.status === "Blocked").length;
    return { project, total, done, blocked, percent };
  }).filter((p) => p.total > 0).sort((a, b) => b.total - a.total);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <span className="text-[#55555c] text-[15px]">Loading tasks…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f10] flex flex-col">
      {/* ── Header ── */}
      <div className="px-8 pt-8 pb-5 flex items-center justify-between border-b border-[#2a2a2d]">
        <div>
          <h1 className="text-[22px] font-bold text-[#e8e8ea] tracking-tight">Task Board</h1>
          <p className="text-[13px] text-[#55555c] mt-0.5">
            {filteredTasks.length} showing · {tasks.length} total
            {unreadCount > 0 && <span className="ml-2 text-[#8b95e8]">· {unreadCount} need review</span>}
            {refreshedAt && (
              <span className="ml-2 text-[12px]">
                · Updated {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowArchive(true); fetchArchived(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-[6px] bg-[#222224] hover:bg-[#2a2a2d] text-[#8b8b91] text-[14px] font-semibold transition-colors border border-[#3a3a3d]"
          >
            📦 Archive
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-[6px] bg-[#5e6ad2] hover:bg-[#4f5bc4] text-white text-[14px] font-semibold transition-colors"
          >
            <span className="text-[18px] leading-none">+</span> New Task
          </button>
        </div>
      </div>

      {/* ── Code Room Strip ── */}
      {(liveSessions.length > 0 || showCodeRoom) && (
        <div className="border-b border-[#1d1d20] bg-[#0d0f1a]">
          <div
            className="px-8 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#111320] transition-colors"
            onClick={() => setShowCodeRoom((v) => !v)}
          >
            <span className="text-[12px] font-bold text-[#26a86a] animate-pulse">⚡</span>
            <span className="text-[13px] font-semibold text-[#8b95e8]">Code Room</span>
            {liveSessions.length > 0 ? (
              liveSessions.map(s => (
                <span key={s.id} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#0d3320] text-[#26a86a] border border-[#166534] animate-pulse">
                  {s.agent} is coding
                </span>
              ))
            ) : (
              <span className="text-[11px] text-[#3a3a42]">No one coding right now</span>
            )}
            <span className="ml-auto text-[11px] text-[#55555c]">{showCodeRoom ? "▲ collapse" : "▼ expand"}</span>
          </div>
          {showCodeRoom && (
            <div className="px-8 pb-4 flex flex-col gap-2">
              {codingSessions.length === 0 && (
                <p className="text-[13px] text-[#55555c]">No coding sessions yet. Sessions appear here when an agent starts coding.</p>
              )}
              {codingSessions.map((s) => {
                const emoji = s.agent.toLowerCase().includes("graham") ? "📈" : s.agent.toLowerCase().includes("mike") ? "🎯" : s.agent.toLowerCase().includes("jill") ? "💻" : "🤖";
                const elapsed = Math.round((Date.now() - new Date(s.startedAt).getTime()) / 60000);
                return (
                <div key={s.id} className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] p-3 flex items-center gap-3">
                  <span className="text-[22px]">{emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[14px] font-bold text-[#e8e8ea]">{s.agent}</p>
                      {s.status === "running" && <span className="text-[10px] font-bold text-[#26a86a] animate-pulse">● LIVE</span>}
                      {s.status === "done" && <span className="text-[10px] font-bold text-[#55555c]">✓ Done</span>}
                      {s.status === "error" && <span className="text-[10px] font-bold text-[#e05252]">✕ Error</span>}
                    </div>
                    <p className="text-[12px] text-[#8b8b91] truncate">{s.task}</p>
                  </div>
                  <span className="text-[11px] text-[#55555c] shrink-0">{elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed/60)}h`}</span>
                </div>
                );
              })}
              {codingSessions[0]?.output && (
                <pre className="rounded-[8px] bg-[#0a0a0b] border border-[#1a1a1d] p-4 text-[12px] font-mono text-[#c5caff] overflow-y-auto max-h-[180px] whitespace-pre-wrap break-words">
                  {codingSessions[0].output}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="px-8 py-4 border-b border-[#1d1d20] bg-[#121214]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks…"
            className="input text-[14px]"
          />
          <SelectField value={assigneeFilter} onChange={setAssigneeFilter} options={["All", ...ASSIGNEES]} />
          <SelectField value={priorityFilter} onChange={setPriorityFilter} options={["All", ...PRIORITIES]} />
          <SelectField value={projectFilter} onChange={setProjectFilter} options={PROJECTS} />
          <button
            onClick={() => setOnlyMyTasks((v) => !v)}
            className={`rounded-[6px] px-4 py-2 text-[14px] font-semibold border transition-colors ${onlyMyTasks ? "bg-[#1b2042] text-[#c5caff] border-[#3a4080]" : "bg-[#1a1a1c] text-[#8b8b91] border-[#2a2a2d]"}`}
          >
            {onlyMyTasks ? "Focused: Ike only" : "Show Ike tasks"}
          </button>
        </div>
      </div>

      {/* ── Project rollup ── */}
      <div className="px-8 py-4 border-b border-[#1d1d20] bg-[#101012]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-[#8b8b91] uppercase tracking-wider">Project Rollup</h2>
          <span className="text-[12px] text-[#55555c]">Auto-calculated from task completion</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {projectRollups.map((p) => (
            <div key={p.project} className="rounded-[8px] border border-[#2a2a2d] bg-[#161618] p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[14px] font-semibold text-[#e8e8ea]">{p.project}</div>
                <div className="text-[12px] font-bold text-[#8b95e8]">{p.percent}%</div>
              </div>
              <div className="w-full h-2 rounded-full bg-[#222224] overflow-hidden mb-3">
                <div className="h-full bg-[#5e6ad2]" style={{ width: `${p.percent}%` }} />
              </div>
              <div className="flex items-center gap-3 text-[12px] text-[#8b8b91]">
                <span>✅ {p.done}/{p.total} done</span>
                {p.blocked > 0 && <span className="text-[#e06060]">⛔ {p.blocked} blocked</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Kanban columns ── */}
      <div className="flex-1 px-8 py-6 flex gap-5 overflow-x-auto">
        {COLUMNS.map((col) => {
          const colTasks = columnTasks(col);
          const st = STATUS_STYLE[col];
          return (
            <div key={col} className="flex-1 min-w-[270px] max-w-[350px] flex flex-col">
              {/* Column header */}
              <div
                className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-[8px]"
                style={{ background: st.bg, border: `1px solid ${st.border}` }}
              >
                <span className="w-3 h-3 rounded-full" style={{ background: st.text }} />
                <span className="text-[15px] font-bold uppercase tracking-wide" style={{ color: st.text }}>
                  {col}
                </span>
                <span
                  className="ml-auto text-[13px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: st.border, color: st.text }}
                >
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="flex flex-col gap-3">
                {colTasks.length === 0 && (
                  <div className="border border-dashed border-[#2a2a2d] rounded-[8px] p-6 text-center text-[13px] text-[#55555c]">
                    No tasks
                  </div>
                )}
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    expanded={expandedId === task.id}
                    onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Archive drawer ── */}
      {showArchive && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setShowArchive(false)}
        >
          <div className="bg-[#0f0f10] border-l border-[#2a2a2d] w-full max-w-lg h-full flex flex-col shadow-2xl">
            {/* Drawer header */}
            <div className="px-6 py-5 border-b border-[#2a2a2d] flex items-center justify-between">
              <div>
                <h2 className="text-[17px] font-bold text-[#e8e8ea]">📦 Archive</h2>
                <p className="text-[12px] text-[#55555c] mt-0.5">Completed tasks older than 24h</p>
              </div>
              <button
                onClick={() => setShowArchive(false)}
                className="text-[#55555c] hover:text-[#8b8b91] text-2xl leading-none transition-colors"
              >×</button>
            </div>

            {/* Archived list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {archivedTasks.length === 0 ? (
                <div className="text-center text-[#55555c] text-[14px] mt-12">No archived tasks yet.</div>
              ) : (
                archivedTasks
                  .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime())
                  .map((task) => (
                    <div
                      key={task.id}
                      className="rounded-[8px] p-4 border border-[#2a2a2d] bg-[#161618]"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-[4px] ${PRIORITY_STYLE[task.priority]}`}>
                          {task.priority}
                        </span>
                        <span className="text-[12px] font-bold px-3 py-1 rounded-full text-[#2ec97a] bg-[#172b1e] border border-[#1e5a38]">
                          Done
                        </span>
                        <span className="ml-auto text-[11px] text-[#55555c]">
                          ✓ {task.completedAt ? new Date(task.completedAt).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <p className="text-[14px] font-semibold text-[#e8e8ea]">{task.title}</p>
                      {task.description && (
                        <p className="text-[12px] text-[#55555c] mt-1">{task.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[12px] text-[#55555c]">👤 {task.assignee}</span>
                        {task.notes && (
                          <span className="text-[12px] text-[#55555c]">📝 {task.notes}</span>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Create task modal ── */}
      {showForm && (
        <Modal title="New Task" onClose={() => setShowForm(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Title">
              <input
                required
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What needs to be done?"
                className="input text-[15px]"
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="More detail (optional)"
                className="input resize-none"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Assignee">
                <SelectField
                  value={form.assignee}
                  onChange={(v) => setForm({ ...form, assignee: v })}
                  options={ASSIGNEES}
                />
              </Field>
              <Field label="Priority">
                <SelectField
                  value={form.priority}
                  onChange={(v) => setForm({ ...form, priority: v as Priority })}
                  options={PRIORITIES}
                />
              </Field>
            </div>
            <Field label="Status">
              <SelectField
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as Status })}
                options={COLUMNS}
              />
            </Field>
            <Field label="Due Date">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="input text-[14px]"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-primary">
                {submitting ? "Creating…" : "Create Task"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  expanded,
  onToggle,
  onUpdate,
  onDelete,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, updates: { status?: Status; notes?: string; assignee?: string; dueDate?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [messages, setMessages] = useState<TaskMessage[]>(task.messages ?? []);
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Keep messages in sync when task refreshes
  useEffect(() => {
    setMessages(task.messages ?? []);
  }, [task.messages]);

  // Scroll thread to bottom when new messages arrive
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendMessage() {
    if (!msgText.trim()) return;
    setSendingMsg(true);
    const res = await fetch("/api/tasks/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, from: "nick", text: msgText }),
    });
    const { message } = await res.json();
    setMessages((prev) => [...prev, message]);
    setMsgText("");
    setSendingMsg(false);
    onUpdate(task.id, {}); // refresh task
  }

  const st = STATUS_STYLE[task.status];
  const nextStatus = NEXT_STATUS[task.status];
  const moveTargets = COLUMNS.filter((s) => s !== task.status);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  if (due) due.setHours(0, 0, 0, 0);
  const isOverdue = !!due && due.getTime() < today.getTime() && task.status !== "Done";
  const isDueToday = !!due && due.getTime() === today.getTime() && task.status !== "Done";

  return (
    <div
      className="rounded-[8px] overflow-hidden transition-all"
      style={{
        background: "#161618",
        border: `1px solid ${expanded ? st.border : "#2a2a2d"}`,
        boxShadow: expanded ? `0 0 0 1px ${st.border}20` : "none",
      }}
    >
      {/* ── Collapsed header (always visible, click to expand) ── */}
      <div
        className="p-4 cursor-pointer select-none hover:bg-[#1c1c1f] transition-colors"
        onClick={onToggle}
      >
        {/* Badges row */}
        <div className="flex items-center gap-2 mb-2.5">
          {/* Priority badge */}
          <span className={`text-[11px] font-bold px-2 py-1 rounded-[4px] ${PRIORITY_STYLE[task.priority]}`}>
            {task.priority}
          </span>
          {/* Big status badge */}
          <span
            className="text-[12px] font-bold px-3 py-1 rounded-full tracking-wide"
            style={{ background: st.bg, color: st.text, border: `1px solid ${st.border}` }}
          >
            {task.status}
          </span>
          {hasUnreadForNick(task) && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-[#1b2042] text-[#8b95e8] border border-[#3a4080]">
              New reply
            </span>
          )}
          {task.dueDate && (
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${isOverdue ? "bg-[#2e1919] text-[#ff7b7b] border-[#a83a3a]" : isDueToday ? "bg-[#2b2414] text-[#ffd166] border-[#8b6b1f]" : "bg-[#1f2430] text-[#9fb3ff] border-[#44537a]"}`}>
              {isOverdue ? "OVERDUE" : isDueToday ? "DUE TODAY" : `Due ${new Date(task.dueDate).toLocaleDateString()}`}
            </span>
          )}
          <span className="ml-auto text-[11px] text-[#55555c]">{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Title */}
        <p className="text-[15px] font-semibold text-[#e8e8ea] leading-snug">{task.title}</p>
      </div>

      {/* ── Collapsed quick bar ── */}
      {!expanded && (
        <div
          className="px-4 pb-3 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[12px] text-[#55555c]">👤 {task.assignee}</span>
          <span className="text-[12px] text-[#55555c]">🏷️ {getTaskProject(task)}</span>
          {task.dueDate && (
            <span className={`text-[11px] font-semibold ${isOverdue ? "text-[#ff7b7b]" : isDueToday ? "text-[#ffd166]" : "text-[#7fa7ff]"}`}>
              📅 {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {(task.messages?.length ?? 0) > 0 && (
            <span className="text-[11px] text-[#55555c]">💬 {task.messages!.length}</span>
          )}
          {nextStatus && (
            <button
              onClick={() => onUpdate(task.id, { status: nextStatus })}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-semibold transition-colors hover:opacity-90"
              style={{
                background: STATUS_STYLE[nextStatus].bg,
                color: STATUS_STYLE[nextStatus].text,
                border: `1px solid ${STATUS_STYLE[nextStatus].border}`,
              }}
            >
              → {nextStatus}
            </button>
          )}
        </div>
      )}

      {/* ── Expanded details ── */}
      {expanded && (
        <div
          className="px-4 pb-4 space-y-4 border-t border-[#2a2a2d] pt-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Description */}
          {task.description && (
            <p className="text-[13px] text-[#8b8b91] leading-relaxed">{task.description}</p>
          )}

          {/* Reassign + due date */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-[#55555c]">👤 Assignee</span>
            <select
              value={task.assignee}
              onChange={(e) => onUpdate(task.id, { assignee: e.target.value })}
              className="input"
              style={{ width: "auto", minWidth: "130px" }}
            >
              {ASSIGNEES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <span className="text-[13px] text-[#55555c] ml-auto">📅 Due</span>
            <input
              type="date"
              value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
              onChange={(e) => onUpdate(task.id, { dueDate: e.target.value })}
              className="input"
              style={{ width: "auto", minWidth: "150px" }}
            />
          </div>
          {task.dueDate && (isOverdue || isDueToday) && (
            <div className={`rounded-[8px] px-3 py-2 text-[13px] font-semibold border ${isOverdue ? "bg-[#2e1919] text-[#ff7b7b] border-[#a83a3a]" : "bg-[#2b2414] text-[#ffd166] border-[#8b6b1f]"}`}>
              {isOverdue ? `Overdue since ${new Date(task.dueDate).toLocaleDateString()}` : `Due today · ${new Date(task.dueDate).toLocaleDateString()}`}
            </div>
          )}

          {/* Message Thread */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[15px]">💬</span>
              <span className="text-[12px] font-semibold text-[#8b8b91] uppercase tracking-wider">Thread</span>
            </div>

            {/* Messages */}
            <div
              ref={threadRef}
              className="flex flex-col gap-2 max-h-[200px] overflow-y-auto mb-2 pr-1"
            >
              {messages.length === 0 && (
                <p className="text-[12px] text-[#55555c] italic">No messages yet. Send one to notify Ike.</p>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[85%] ${msg.from === "nick" ? "self-end items-end" : "self-start items-start"}`}
                >
                  <div
                    className="px-3 py-2 rounded-[8px] text-[13px] leading-snug"
                    style={
                      msg.from === "nick"
                        ? { background: "#1b2042", color: "#c5caff", borderRadius: "8px 8px 2px 8px" }
                        : { background: "#222224", color: "#e8e8ea", borderRadius: "8px 8px 8px 2px" }
                    }
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-[#55555c] mt-0.5">
                    {msg.from === "nick" ? "Nick" : "Ike"} · {new Date(msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2 items-end">
              <textarea
                rows={2}
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                placeholder="Message Ike… (Enter to send)"
                className="input resize-none text-[13px] flex-1"
              />
              <button
                onClick={sendMessage}
                disabled={sendingMsg || !msgText.trim()}
                className="px-3 py-2 rounded-[6px] text-[13px] font-semibold transition-colors"
                style={{
                  background: "#1b2042",
                  color: "#8b95e8",
                  border: "1px solid #3a4080",
                  opacity: sendingMsg || !msgText.trim() ? 0.4 : 1,
                }}
              >
                {sendingMsg ? "…" : "Send"}
              </button>
            </div>
          </div>

          {/* Move buttons */}
          <div>
            <p className="text-[11px] font-semibold text-[#55555c] uppercase tracking-wider mb-2">
              Move to
            </p>
            <div className="flex flex-wrap gap-2">
              {moveTargets.map((s) => {
                const mst = STATUS_STYLE[s];
                return (
                  <button
                    key={s}
                    onClick={() => onUpdate(task.id, { status: s })}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-[13px] font-semibold transition-colors hover:opacity-90"
                    style={{ background: mst.bg, color: mst.text, border: `1px solid ${mst.border}` }}
                  >
                    → {s}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kill task */}
          <div className="flex justify-end pt-1 border-t border-[#2a2a2d]">
            {confirmKill ? (
              <div className="flex items-center gap-2 pt-3">
                <span className="text-[13px] text-[#e8a045]">Are you sure?</span>
                <button
                  onClick={() => setConfirmKill(false)}
                  className="px-3 py-1.5 rounded-[6px] text-[12px] border border-[#2a2a2d] text-[#8b8b91] hover:text-[#e8e8ea] transition-colors"
                >
                  No
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="px-3 py-1.5 rounded-[6px] text-[13px] font-bold bg-[#e05252]/20 text-[#e05252] border border-[#e05252]/40 hover:bg-[#e05252]/30 transition-colors"
                >
                  Yes, Kill It
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmKill(true)}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-[6px] text-[13px] font-semibold bg-[#2e1919] text-[#e06060] border border-[#702828]/50 hover:bg-[#3d2020] transition-colors"
              >
                ✕ Kill Task
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared UI ────────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#161618] border border-[#2a2a2d] rounded-[10px] w-full max-w-md mx-4 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-[#e8e8ea]">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#55555c] hover:text-[#8b8b91] transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-semibold text-[#8b8b91] uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

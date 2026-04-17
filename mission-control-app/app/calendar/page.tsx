"use client";

import { useState, useEffect, useCallback } from "react";
import type { CalendarEvent } from "../types";
import EventBlock from "../components/EventBlock";

const agentColors: Record<string, string> = {
  Susan: "#3b82f6",
  Jill: "#a855f7",
  "Dr Phil": "#22c55e",
  Mike: "#f59e0b",
  Graham: "#eab308",
};

const agentNames = ["Susan", "Jill", "Dr Phil", "Mike", "Graham"];
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 13 }, (_, i) => i + 7);

// ── Scheduled Jobs ─────────────────────────────────────────────────────────

interface ScheduledJob {
  id: string;
  name: string;
  type: "Recurring" | "One-time";
  schedule: string;
  nextRun: string;
  agent: string;
  enabled: boolean;
}

const DEFAULT_JOBS: ScheduledJob[] = [
  { id: "j1", name: "Heartbeat check", type: "Recurring", schedule: "Every 30 min", nextRun: "Auto", agent: "Ike", enabled: true },
  { id: "j2", name: "Graham pre-market scan", type: "Recurring", schedule: "Daily 7:00 AM CT", nextRun: "Mon 7:00 AM", agent: "Graham", enabled: true },
  { id: "j3", name: "Graham weekly email", type: "Recurring", schedule: "Fridays 5:00 PM CT", nextRun: "Fri 5:00 PM", agent: "Graham", enabled: true },
  { id: "j4", name: "Weekly priority review", type: "Recurring", schedule: "Mondays 9:00 AM CT", nextRun: "Mon 9:00 AM", agent: "Susan", enabled: true },
  { id: "j5", name: "Pipeline summary", type: "Recurring", schedule: "Fridays 10:00 AM CT", nextRun: "Fri 10:00 AM", agent: "Mike", enabled: true },
];

const JOB_AGENTS = ["Ike", "Susan", "Jill", "Dr Phil", "Mike", "Graham"];

// ── Helpers ────────────────────────────────────────────────────────────────

function getWeekDates(offset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [tab, setTab] = useState<"schedule" | "jobs">("schedule");
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDates, setWeekDates] = useState<Date[]>([]);
  const [today, setToday] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calLastUpdated, setCalLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  useEffect(() => {
    setWeekDates(getWeekDates(weekOffset));
  }, [weekOffset]);

  // Fetch calendar events from API
  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch("/api/calendar");
      const data = await res.json();
      const rawEvents = data.events ?? [];
      // Merge agent colors into events
      const coloredEvents: CalendarEvent[] = rawEvents.map((e: CalendarEvent) => ({
        ...e,
        color: e.color ?? agentColors[e.agent] ?? "#8b8b91",
      }));
      setEvents(coloredEvents);
      setCalLastUpdated(data.lastUpdated ?? null);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCalendar();
    const interval = setInterval(fetchCalendar, 30_000);
    return () => clearInterval(interval);
  }, [fetchCalendar]);

  // Jobs state
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [showJobForm, setShowJobForm] = useState(false);
  const [jobForm, setJobForm] = useState({ name: "", type: "Recurring" as "Recurring" | "One-time", schedule: "", agent: "Ike" });
  const [ranJobId, setRanJobId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("mc-scheduled-jobs");
    if (stored) {
      setJobs(JSON.parse(stored));
    } else {
      setJobs(DEFAULT_JOBS);
      localStorage.setItem("mc-scheduled-jobs", JSON.stringify(DEFAULT_JOBS));
    }
  }, []);

  function saveJobs(updated: ScheduledJob[]) {
    setJobs(updated);
    localStorage.setItem("mc-scheduled-jobs", JSON.stringify(updated));
  }

  function toggleJob(id: string) {
    saveJobs(jobs.map((j) => (j.id === id ? { ...j, enabled: !j.enabled } : j)));
  }

  // TODO: Wire to actual trigger API
  function runNow(id: string) {
    setRanJobId(id);
    setTimeout(() => setRanJobId(null), 1500);
  }

  function handleAddJob(e: React.FormEvent) {
    e.preventDefault();
    if (!jobForm.name.trim() || !jobForm.schedule.trim()) return;
    const newJob: ScheduledJob = {
      id: crypto.randomUUID(),
      name: jobForm.name,
      type: jobForm.type,
      schedule: jobForm.schedule,
      nextRun: jobForm.type === "One-time" ? jobForm.schedule : "—",
      agent: jobForm.agent,
      enabled: true,
    };
    saveJobs([...jobs, newJob]);
    setJobForm({ name: "", type: "Recurring", schedule: "", agent: "Ike" });
    setShowJobForm(false);
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-[13px] font-medium cursor-pointer transition-colors border-b-2 ${
      active
        ? "text-[#e8e8ea] border-[#5e6ad2]"
        : "text-[#55555c] border-transparent hover:text-[#8b8b91]"
    }`;

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-[#e8e8ea]">Calendar</h1>
          {calLastUpdated && (
            <p className="text-[11px] text-[#55555c] mt-0.5">
              Schedule data: {new Date(calLastUpdated).toLocaleString()}
            </p>
          )}
        </div>

        {tab === "schedule" && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekOffset((w) => w - 1)}
              className="px-3 py-1.5 rounded-[5px] text-[12px] text-[#8b8b91] hover:bg-[rgba(255,255,255,0.06)] transition-colors cursor-pointer"
            >
              &larr; Prev
            </button>
            <button
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 rounded-[5px] text-[12px] text-[#8b8b91] hover:bg-[rgba(255,255,255,0.06)] transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={() => setWeekOffset((w) => w + 1)}
              className="px-3 py-1.5 rounded-[5px] text-[12px] text-[#8b8b91] hover:bg-[rgba(255,255,255,0.06)] transition-colors cursor-pointer"
            >
              Next &rarr;
            </button>
          </div>
        )}

        {tab === "jobs" && (
          <button
            onClick={() => setShowJobForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-[#5e6ad2] hover:bg-[#4f5bc4] text-white text-[12px] font-medium transition-colors cursor-pointer"
          >
            <span className="text-[14px] leading-none">+</span> Add Job
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#2a2a2d] mb-6">
        <button className={tabClass(tab === "schedule")} onClick={() => setTab("schedule")}>
          Agent Schedule
        </button>
        <button className={tabClass(tab === "jobs")} onClick={() => setTab("jobs")}>
          Scheduled Jobs
        </button>
      </div>

      {/* TAB 1: Agent Schedule */}
      {tab === "schedule" && (
        <>
          {/* Agent Legend */}
          <div className="flex gap-4 mb-4">
            {agentNames.map((name) => (
              <div key={name} className="flex items-center gap-1.5 text-[12px]">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: agentColors[name] }}
                />
                <span className="text-[#55555c]">{name}</span>
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="rounded-md border border-[#2a2a2d] bg-[#1c1c1f] overflow-hidden">
            <div className="grid grid-cols-[50px_repeat(7,1fr)]">
              {/* Header row */}
              <div className="border-b border-[#2a2a2d] p-2" />
              {weekDates.map((date, i) => {
                const isToday = today ? date.toDateString() === today.toDateString() : false;
                return (
                  <div
                    key={i}
                    className={`border-b border-l border-[#2a2a2d] py-2 px-1 text-center ${isToday ? "bg-[#5e6ad2]/8" : ""}`}
                  >
                    <div className="text-[11px] text-[#55555c]">{dayNames[i]}</div>
                    <div className={`text-[13px] font-medium ${isToday ? "text-[#5e6ad2]" : "text-[#e8e8ea]"}`}>
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}

              {/* Time gutter + day columns */}
              <div className="border-r border-[#2a2a2d]">
                {hours.map((hour) => (
                  <div key={hour} className="h-[60px] border-b border-[#2a2a2d] flex items-start pt-1 pr-2 justify-end">
                    <span className="text-[11px] text-[#55555c]">
                      {hour > 12 ? hour - 12 : hour}{hour >= 12 ? "pm" : "am"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {Array.from({ length: 7 }, (_, dayIdx) => {
                const isToday = today ? weekDates[dayIdx]?.toDateString() === today.toDateString() : false;
                const dayEvents = events.filter((e) => e.day === dayIdx);

                type EvWithCol = { event: typeof dayEvents[0]; col: number; totalCols: number };
                const placed: EvWithCol[] = [];
                for (const ev of dayEvents) {
                  const evStart = ev.startHour;
                  const evEnd = ev.startHour + ev.durationHours;
                  const overlapping = placed.filter(
                    (p) => p.event.startHour < evEnd && p.event.startHour + p.event.durationHours > evStart
                  );
                  const usedCols = new Set(overlapping.map((p) => p.col));
                  let col = 0;
                  while (usedCols.has(col)) col++;
                  placed.push({ event: ev, col, totalCols: 1 });
                }
                for (const p of placed) {
                  const evStart = p.event.startHour;
                  const evEnd = p.event.startHour + p.event.durationHours;
                  const group = placed.filter(
                    (q) => q.event.startHour < evEnd && q.event.startHour + q.event.durationHours > evStart
                  );
                  const maxCol = Math.max(...group.map((q) => q.col)) + 1;
                  p.totalCols = maxCol;
                }

                return (
                  <div
                    key={dayIdx}
                    className={`relative border-l border-[#2a2a2d] ${isToday ? "bg-[#5e6ad2]/5" : ""}`}
                    style={{ height: `${hours.length * 60}px` }}
                  >
                    {hours.map((_, hi) => (
                      <div
                        key={hi}
                        className="absolute w-full border-b border-[#2a2a2d]"
                        style={{ top: `${hi * 60}px`, height: "60px" }}
                      />
                    ))}
                    {placed.map(({ event, col, totalCols }, idx) => (
                      <EventBlock
                        key={idx}
                        event={event}
                        columnIndex={col}
                        columnCount={totalCols}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: Scheduled Jobs */}
      {tab === "jobs" && (
        <div className="rounded-md border border-[#2a2a2d] bg-[#1c1c1f] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#2a2a2d]">
                {["Name", "Type", "Schedule", "Next Run", "Agent", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[11px] font-semibold text-[#55555c] uppercase tracking-wider px-4 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-[#2a2a2d] last:border-b-0 hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                >
                  <td className="px-4 py-3 text-[13px] text-[#e8e8ea] font-medium">{job.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      job.type === "Recurring"
                        ? "bg-[#5e6ad2]/15 text-[#5e6ad2] border-[#5e6ad2]/30"
                        : "bg-[#e8a045]/15 text-[#e8a045] border-[#e8a045]/30"
                    }`}>
                      {job.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-[#8b8b91]">{job.schedule}</td>
                  <td className="px-4 py-3 text-[12px] text-[#8b8b91]">{job.nextRun}</td>
                  <td className="px-4 py-3 text-[12px] text-[#8b8b91]">{job.agent}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleJob(job.id)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border cursor-pointer ${
                        job.enabled
                          ? "bg-[#26a86a]/15 text-[#26a86a] border-[#26a86a]/30"
                          : "bg-[#8b8b91]/15 text-[#8b8b91] border-[#8b8b91]/30"
                      }`}
                    >
                      {job.enabled ? "Active" : "Disabled"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => runNow(job.id)}
                      disabled={!job.enabled}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-[5px] transition-colors cursor-pointer ${
                        ranJobId === job.id
                          ? "bg-[#26a86a]/20 text-[#26a86a]"
                          : "text-[#8b8b91] hover:text-[#e8e8ea] hover:bg-[rgba(255,255,255,0.06)]"
                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      {ranJobId === job.id ? "Running..." : (
                        <span title="Simulated — not wired to trigger API">Run Now</span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[12px] text-[#55555c]">
                    No scheduled jobs
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Job Modal */}
      {showJobForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setShowJobForm(false)}
        >
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-[8px] w-full max-w-md mx-4 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea]">Add Job</h2>
              <button
                onClick={() => setShowJobForm(false)}
                className="text-[#55555c] hover:text-[#8b8b91] transition-colors text-lg leading-none cursor-pointer"
              >
                x
              </button>
            </div>
            <form onSubmit={handleAddJob} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Name</label>
                <input
                  required
                  autoFocus
                  value={jobForm.name}
                  onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
                  placeholder="Job name"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Type</label>
                  <select
                    value={jobForm.type}
                    onChange={(e) => setJobForm({ ...jobForm, type: e.target.value as "Recurring" | "One-time" })}
                    className="input"
                  >
                    <option value="Recurring">Recurring</option>
                    <option value="One-time">One-time</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Agent</label>
                  <select
                    value={jobForm.agent}
                    onChange={(e) => setJobForm({ ...jobForm, agent: e.target.value })}
                    className="input"
                  >
                    {JOB_AGENTS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Schedule</label>
                <input
                  required
                  value={jobForm.schedule}
                  onChange={(e) => setJobForm({ ...jobForm, schedule: e.target.value })}
                  placeholder="e.g. Every 30 min, Daily 9:00 AM CT, */30 * * * *"
                  className="input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowJobForm(false)} className="btn-ghost cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="btn-primary cursor-pointer">
                  Add Job
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

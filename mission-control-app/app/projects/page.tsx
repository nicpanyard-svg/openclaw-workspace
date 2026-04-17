"use client";

import { useState, useEffect } from "react";

type ProjectStatus = "Active" | "On Hold" | "Complete" | "Archived";

interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  owner: string;
  progress: number;
  tags: string[];
  description: string;
  updatedAt: string;
  tasks?: string[];
}

interface Task {
  id: string;
  title: string;
  assignee: string;
  status: string;
  completedAt?: string;
  createdAt?: string;
}

// Which assignees contribute to each dynamic project
const PROJECT_ASSIGNEES: Record<string, string[]> = {
  p1: ["Jill", "Dr. Phil", "Jack"],
  p4: ["Mike"],
  p5: ["Dr. Phil"],
};

function computeStats(tasks: Task[], assignees: string[]): { progress: number; updatedAt: string } {
  const group = tasks.filter((t) => assignees.includes(t.assignee));
  if (group.length === 0) return { progress: 0, updatedAt: "" };

  const done = group.filter((t) => t.status === "Done");
  const progress = Math.round((done.length / group.length) * 100);

  // Most recent completedAt among done tasks, else most recent createdAt in group
  const dates = [
    ...done.map((t) => t.completedAt).filter(Boolean),
    ...group.map((t) => t.createdAt).filter(Boolean),
  ] as string[];
  const latest = dates.sort().at(-1) ?? "";
  const updatedAt = latest ? latest.split("T")[0] : "";

  return { progress, updatedAt };
}

const STATUSES: ProjectStatus[] = ["Active", "On Hold", "Complete", "Archived"];
const OWNERS = ["Susan", "Jill", "Graham", "Mike", "Dr Phil"];

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; border: string }> = {
  Active: { bg: "bg-[#5e6ad2]/15", text: "text-[#5e6ad2]", border: "border-[#5e6ad2]/30" },
  "On Hold": { bg: "bg-[#e8a045]/15", text: "text-[#e8a045]", border: "border-[#e8a045]/30" },
  Complete: { bg: "bg-[#26a86a]/15", text: "text-[#26a86a]", border: "border-[#26a86a]/30" },
  Archived: { bg: "bg-[#8b8b91]/15", text: "text-[#8b8b91]", border: "border-[#8b8b91]/30" },
};

const TAG_COLORS: Record<string, string> = {
  Build: "bg-[#a855f7]/15 text-[#a855f7] border-[#a855f7]/30",
  Sales: "bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30",
  Research: "bg-[#3b82f6]/15 text-[#3b82f6] border-[#3b82f6]/30",
  Reliability: "bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/30",
};

const DEFAULT_PROJECTS: Project[] = [
  {
    id: "p1",
    name: "Mission Control",
    status: "Active",
    owner: "Jill",
    progress: 60,
    tags: ["Build"],
    description: "Building the Next.js Mission Control app with Linear design, task board, calendar, and projects screen.",
    updatedAt: "2026-03-21",
  },
  {
    id: "p2",
    name: "Graham Stock Board",
    status: "Complete",
    owner: "Graham",
    progress: 100,
    tags: ["Research", "Build"],
    description: "Full stock research board — 36 stocks, commodities, charts, paper trading. Live prices wired in.",
    updatedAt: "2026-03-18",
  },
  {
    id: "p3",
    name: "iNet World",
    status: "Complete",
    owner: "Jill",
    progress: 100,
    tags: ["Build"],
    description: "Interactive product and market visualization for iNet sales team.",
    updatedAt: "2026-03-15",
  },
  {
    id: "p4",
    name: "Sales Pipeline",
    status: "Active",
    owner: "Mike",
    progress: 20,
    tags: ["Sales"],
    description: "Building lead research workflow and outreach cadence for top 6 target accounts.",
    updatedAt: "2026-03-20",
  },
  {
    id: "p5",
    name: "OpenClaw Stability",
    status: "Active",
    owner: "Dr Phil",
    progress: 40,
    tags: ["Reliability"],
    description: "Watchdog, health monitoring, and reliability improvements for OpenClaw deployment.",
    updatedAt: "2026-03-19",
  },
];

type SortKey = "status" | "owner" | "progress" | "updatedAt";

const EMPTY_FORM = {
  name: "",
  owner: "Susan",
  status: "Active" as ProjectStatus,
  tags: "",
  description: "",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sortBy, setSortBy] = useState<SortKey>("status");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterOwner, setFilterOwner] = useState<string>("All");

  // Load projects from API
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const { projects } = await res.json();
        setProjects(projects);
      } catch {
        setProjects(DEFAULT_PROJECTS);
      }
    }
    fetchProjects();
    const interval = setInterval(fetchProjects, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        status: form.status,
        owner: form.owner,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        description: form.description,
      }),
    });
    const res = await fetch("/api/projects");
    const { projects } = await res.json();
    setProjects(projects);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  const statusOrder: Record<ProjectStatus, number> = { Active: 0, "On Hold": 1, Complete: 2, Archived: 3 };

  const sorted = [...projects]
    .filter((p) => filterStatus === "All" || p.status === filterStatus)
    .filter((p) => filterOwner === "All" || p.owner === filterOwner)
    .sort((a, b) => {
      if (sortBy === "status") return statusOrder[a.status] - statusOrder[b.status];
      if (sortBy === "owner") return a.owner.localeCompare(b.owner);
      if (sortBy === "progress") return b.progress - a.progress;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  return (
    <div className="p-8 max-w-[1000px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold text-[#e8e8ea]">Projects</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] bg-[#5e6ad2] hover:bg-[#4f5bc4] text-white text-[12px] font-medium transition-colors cursor-pointer"
        >
          <span className="text-[14px] leading-none">+</span> New Project
        </button>
      </div>

      {/* Filters & Sort */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#55555c] uppercase tracking-wider">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="input !w-auto !py-1 !px-2 !text-[11px]"
          >
            <option value="status">Status</option>
            <option value="owner">Owner</option>
            <option value="progress">Progress</option>
            <option value="updatedAt">Last Updated</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#55555c] uppercase tracking-wider">Status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input !w-auto !py-1 !px-2 !text-[11px]"
          >
            <option value="All">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[#55555c] uppercase tracking-wider">Owner</span>
          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="input !w-auto !py-1 !px-2 !text-[11px]"
          >
            <option value="All">All</option>
            {OWNERS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Project List */}
      <div className="space-y-2">
        {sorted.map((project) => {
          const expanded = expandedId === project.id;
          const sc = STATUS_COLORS[project.status];
          return (
            <div
              key={project.id}
              className="bg-[#161618] border border-[#2a2a2d] rounded-[6px] hover:border-[#3a3a3d] transition-colors"
            >
              <div
                className="p-4 cursor-pointer flex items-center gap-4"
                onClick={() => setExpandedId(expanded ? null : project.id)}
              >
                {/* Expand arrow */}
                <span className={`text-[10px] text-[#55555c] transition-transform ${expanded ? "rotate-90" : ""}`}>
                  ▶
                </span>

                {/* Name */}
                <span className="text-[13px] font-semibold text-[#e8e8ea] min-w-[180px]">
                  {project.name}
                </span>

                {/* Status badge */}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${sc.bg} ${sc.text} ${sc.border}`}>
                  {project.status}
                </span>

                {/* Owner */}
                <span className="text-[12px] text-[#8b8b91] min-w-[70px]">{project.owner}</span>

                {/* Progress bar */}
                <div className="flex items-center gap-2 min-w-[140px]">
                  <div className="flex-1 h-[4px] bg-[#2a2a2d] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${project.progress}%`,
                        backgroundColor: project.progress === 100 ? "#26a86a" : "#5e6ad2",
                      }}
                    />
                  </div>
                  <span className="text-[11px] text-[#55555c] w-[32px] text-right">{project.progress}%</span>
                </div>

                {/* Tags */}
                <div className="flex gap-1 flex-1">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${TAG_COLORS[tag] || "bg-[#8b8b91]/15 text-[#8b8b91] border-[#8b8b91]/30"}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Updated */}
                <span className="text-[11px] text-[#55555c] ml-auto">{project.updatedAt}</span>
              </div>

              {/* Expanded section */}
              {expanded && (
                <div className="px-4 pb-4 pt-0 border-t border-[#2a2a2d] mx-4 mb-2">
                  <p className="text-[12px] text-[#8b8b91] leading-relaxed mt-3">
                    {project.description}
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="border border-dashed border-[#2a2a2d] rounded-[6px] p-8 text-center text-[12px] text-[#55555c]">
            No projects match your filters
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => e.target === e.currentTarget && setShowForm(false)}
        >
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-[8px] w-full max-w-md mx-4 p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold text-[#e8e8ea]">New Project</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-[#55555c] hover:text-[#8b8b91] transition-colors text-lg leading-none cursor-pointer"
              >
                x
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Name</label>
                <input
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Project name"
                  className="input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Owner</label>
                  <select
                    value={form.owner}
                    onChange={(e) => setForm({ ...form, owner: e.target.value })}
                    className="input"
                  >
                    {OWNERS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
                    className="input"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Tags</label>
                <input
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="Comma-separated (e.g. Build, Research)"
                  className="input"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-[#8b8b91] uppercase tracking-wider">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What is this project about?"
                  className="input resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="btn-primary cursor-pointer">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

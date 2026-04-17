"use client";

import { useState, useEffect, useCallback } from "react";

interface ErrorEntry {
  id: string;
  timestamp: string;
  source: string;
  severity: "error" | "warn" | "info";
  message: string;
}

const SEVERITY_STYLES: Record<string, { dot: string; badge: string; row: string }> = {
  error: { dot: "bg-red-500",    badge: "bg-red-500/10 text-red-400 border border-red-500/20",   row: "border-l-2 border-red-500/40" },
  warn:  { dot: "bg-amber-400",  badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20", row: "border-l-2 border-amber-400/40" },
  info:  { dot: "bg-blue-400",   badge: "bg-blue-500/10 text-blue-400 border border-blue-500/20",  row: "border-l-2 border-blue-400/40" },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "error" | "warn" | "info">("all");
  const [clearing, setClearing] = useState(false);

  const fetchErrors = useCallback(async () => {
    try {
      const res = await fetch("/api/errors");
      const data = await res.json();
      setErrors(data.errors ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchErrors();
    const interval = setInterval(fetchErrors, 30000);
    return () => clearInterval(interval);
  }, [fetchErrors]);

  async function clearAll() {
    if (!confirm("Clear all error logs?")) return;
    setClearing(true);
    await fetch("/api/errors", { method: "DELETE" });
    setErrors([]);
    setTotal(0);
    setClearing(false);
  }

  const filtered = filter === "all" ? errors : errors.filter((e) => e.severity === filter);
  const counts = {
    error: errors.filter((e) => e.severity === "error").length,
    warn:  errors.filter((e) => e.severity === "warn").length,
    info:  errors.filter((e) => e.severity === "info").length,
  };

  return (
    <div className="ml-[220px] min-h-screen bg-[#0e0e10] text-[#e2e2e4] font-sans">
      <div className="max-w-5xl mx-auto px-8 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Error Log</h1>
            <p className="text-sm text-[#666] mt-1">{total} total entries · auto-refreshes every 30s</p>
          </div>
          <button
            onClick={clearAll}
            disabled={clearing || errors.length === 0}
            className="px-3 py-1.5 text-xs rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-40 transition"
          >
            {clearing ? "Clearing..." : "Clear All"}
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {(["error", "warn", "info"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              className={`p-4 rounded-lg border transition text-left ${
                filter === s
                  ? SEVERITY_STYLES[s].badge
                  : "bg-[#1a1a1c] border-[#2a2a2e] hover:border-[#3a3a3e]"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${SEVERITY_STYLES[s].dot}`} />
                <span className="text-xs uppercase tracking-widest text-[#888]">{s}</span>
              </div>
              <div className="text-2xl font-semibold text-white">{counts[s]}</div>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 mb-4 text-xs">
          {(["all", "error", "warn", "info"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded border transition ${
                filter === f
                  ? "bg-[#5e6ad2]/20 text-[#5e6ad2] border-[#5e6ad2]/40"
                  : "bg-transparent text-[#888] border-[#2a2a2e] hover:border-[#3a3a3e]"
              }`}
            >
              {f === "all" ? `All (${errors.length})` : f}
            </button>
          ))}
        </div>

        {/* Log entries */}
        <div className="space-y-2">
          {loading && (
            <div className="text-center py-16 text-[#555]">Loading...</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-[#555]">
              {filter === "all" ? "No errors logged. All clear ✓" : `No ${filter} entries.`}
            </div>
          )}
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className={`flex gap-4 p-4 rounded-lg bg-[#1a1a1c] pl-5 ${SEVERITY_STYLES[entry.severity]?.row ?? ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded font-medium uppercase tracking-wide ${SEVERITY_STYLES[entry.severity]?.badge}`}>
                    {entry.severity}
                  </span>
                  <span className="text-xs text-[#5e6ad2] font-medium">{entry.source}</span>
                  <span className="text-xs text-[#555]">{timeAgo(entry.timestamp)}</span>
                  <span className="text-xs text-[#444]">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                <p className="text-sm text-[#ccc] leading-snug">{entry.message}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

"use client";

import type { SortMode, StatusFilter } from "./types";

const themes = [
  "All Themes",
  "Direct-to-device satellite",
  "Space infrastructure",
  "AI diagnostics / healthcare data",
  "AI-powered mobile advertising",
  "AI operating system for government and enterprise",
  "Latin America e-commerce + digital banking",
  "AI public safety platform",
  "AI-native cybersecurity platform",
  "Latin America digital banking",
  "Voice AI",
  "Quantum computing",
];

export default function FilterControls({
  themeFilter,
  setThemeFilter,
  statusFilter,
  setStatusFilter,
  sortMode,
  setSortMode,
  cardCount,
}: {
  themeFilter: string;
  setThemeFilter: (v: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (v: StatusFilter) => void;
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;
  cardCount: number;
}) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      {/* Theme filter */}
      <select
        value={themeFilter}
        onChange={(e) => setThemeFilter(e.target.value)}
        className="text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-[var(--text-secondary)] cursor-pointer"
      >
        {themes.map((t) => (
          <option key={t} value={t === "All Themes" ? "" : t}>
            {t}
          </option>
        ))}
      </select>

      {/* Status filter pills */}
      <div className="flex gap-1">
        {(["", "Bullish", "Neutral", "Cautious"] as StatusFilter[]).map((s) => {
          const active = statusFilter === s;
          const dotColor =
            s === "Bullish" ? "#26a86a" : s === "Neutral" ? "#e8a045" : s === "Cautious" ? "#e05252" : "";
          return (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className="text-[11px] px-2.5 py-1 rounded-md border transition-colors"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border)",
                background: active ? "rgba(94,106,210,0.12)" : "transparent",
                color: active ? "var(--text-primary)" : "var(--text-muted)",
              }}
            >
              <span className="flex items-center gap-1.5">
                {dotColor && (
                  <span
                    className="w-[6px] h-[6px] rounded-full inline-block"
                    style={{ background: dotColor }}
                  />
                )}
                {s || "All"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sort */}
      <select
        value={sortMode}
        onChange={(e) => setSortMode(e.target.value as SortMode)}
        className="text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-1.5 text-[var(--text-secondary)] cursor-pointer"
      >
        <option value="score">Sort: Score</option>
        <option value="upside">Sort: Analyst Upside</option>
        <option value="conviction">Sort: Conviction</option>
        <option value="ticker">Sort: Ticker A–Z</option>
      </select>

      {/* Card count */}
      <span className="text-[11px] text-[var(--text-muted)] ml-auto">
        {cardCount} stocks
      </span>
    </div>
  );
}

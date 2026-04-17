"use client";

import type { StockCardData } from "./types";

const stageColors: Record<string, string> = {
  Pipeline: "#55555c",
  "Watch / Setup": "#e8a045",
  "Starter Buy": "#26a86a",
  "Add on Proof": "#5e6ad2",
  "Trim / Exit": "#e05252",
};

const stageIcons: Record<string, string> = {
  Pipeline: "🔍",
  "Watch / Setup": "👀",
  "Starter Buy": "🟢",
  "Add on Proof": "➕",
  "Trim / Exit": "✂️",
};

export default function StageDistribution({
  cards,
  columns,
}: {
  cards: StockCardData[];
  columns: string[];
}) {
  const total = cards.length || 1;
  const stages = columns.map((col) => ({
    name: col,
    count: cards.filter((c) => c.stage === col).length,
    color: stageColors[col] || "#5e6ad2",
    icon: stageIcons[col] || "📊",
  }));

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-3">
        Stage Distribution
      </div>

      {/* Stacked bar */}
      <div className="flex h-[32px] rounded-md overflow-hidden mb-3">
        {stages
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-center text-[11px] font-bold text-white transition-all"
              style={{
                width: `${(s.count / total) * 100}%`,
                background: s.color,
                minWidth: s.count > 0 ? "40px" : "0",
              }}
            >
              {s.count}
            </div>
          ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {stages.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span className="text-[12px]">{s.icon}</span>
            <span
              className="w-[8px] h-[8px] rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-[11px] text-[var(--text-muted)]">
              {s.name}
            </span>
            <span className="text-[11px] font-bold" style={{ color: s.color }}>
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

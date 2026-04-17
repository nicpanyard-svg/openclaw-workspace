"use client";

import type { StockCardData } from "./types";

const statusIcon: Record<string, string> = {
  Bullish: "🟢",
  Neutral: "🟡",
  Cautious: "🔴",
};

function scoreColor(score: number): { bg: string; text: string; border: string } {
  if (score >= 80) return { bg: "rgba(38,168,106,0.18)", text: "#26a86a", border: "rgba(38,168,106,0.35)" };
  if (score >= 75) return { bg: "rgba(38,168,106,0.10)", text: "#4eca8a", border: "rgba(38,168,106,0.20)" };
  if (score >= 70) return { bg: "rgba(232,160,69,0.14)", text: "#e8a045", border: "rgba(232,160,69,0.28)" };
  if (score >= 65) return { bg: "rgba(232,160,69,0.08)", text: "#d4a050", border: "rgba(232,160,69,0.18)" };
  return { bg: "rgba(224,82,82,0.10)", text: "#e05252", border: "rgba(224,82,82,0.22)" };
}

export default function HeatMap({ cards }: { cards: StockCardData[] }) {
  const sorted = [...cards].sort((a, b) => b.grahamScore - a.grahamScore);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 mb-5">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-3 font-semibold">
        Signal Heat Map
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sorted.length, 6)}, 1fr)` }}>
        {sorted.map((card) => {
          const sc = scoreColor(card.grahamScore);
          return (
            <div
              key={card.ticker}
              className="rounded-md p-3 flex flex-col items-center gap-1 transition-all hover:scale-105"
              style={{
                background: sc.bg,
                border: `1px solid ${sc.border}`,
              }}
            >
              <span className="text-[10px]">{statusIcon[card.status] || "🟡"}</span>
              <span className="text-[16px] font-black tracking-tight" style={{ color: sc.text }}>
                {card.ticker}
              </span>
              <span
                className="text-[22px] font-black leading-none"
                style={{ color: sc.text }}
              >
                {card.grahamScore}
              </span>
              <span className="text-[9px] text-[var(--text-muted)] font-medium">{card.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

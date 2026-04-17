"use client";

import type { StockCardData } from "./types";

export function ScoreRankingChart({ cards }: { cards: StockCardData[] }) {
  const sorted = [...cards].sort((a, b) => b.grahamScore - a.grahamScore);
  const max = 100;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-3">
        Score Rankings
      </div>
      <div className="flex flex-col gap-1.5">
        {sorted.map((c) => {
          const pct = (c.grahamScore / max) * 100;
          const barColor =
            c.grahamScore >= 80
              ? "#26a86a"
              : c.grahamScore >= 70
              ? "#e8a045"
              : "#e05252";
          return (
            <div key={c.ticker} className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--text-primary)] w-[44px] text-right">
                {c.ticker}
              </span>
              <div className="flex-1 h-[14px] bg-[var(--surface)] rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{ width: `${pct}%`, background: barColor }}
                />
              </div>
              <span className="text-[10px] text-[var(--text-muted)] w-[24px]">
                {c.grahamScore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScoreVsUpsideChart({ cards }: { cards: StockCardData[] }) {
  const withData = cards.filter((c) => c.price && c.analystTarget);
  if (withData.length === 0) return null;

  // Calculate upside percentages
  const points = withData.map((c) => ({
    ticker: c.ticker,
    score: c.grahamScore,
    upside: ((c.analystTarget! - c.price!) / c.price!) * 100,
  }));

  // Chart dimensions (CSS-based scatter plot)
  const maxUpside = Math.max(...points.map((p) => p.upside), 70);
  const minScore = Math.min(...points.map((p) => p.score), 60);
  const maxScore = Math.max(...points.map((p) => p.score), 90);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
      <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-3">
        Score vs Analyst Upside
      </div>
      <div className="relative h-[200px] bg-[var(--surface)] rounded-md overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 left-0 right-0 border-t border-[var(--border)]" />
          <div className="absolute top-1/2 left-0 right-0 border-t border-[var(--border)]" />
          <div className="absolute top-3/4 left-0 right-0 border-t border-[var(--border)]" />
          <div className="absolute left-1/4 top-0 bottom-0 border-l border-[var(--border)]" />
          <div className="absolute left-1/2 top-0 bottom-0 border-l border-[var(--border)]" />
          <div className="absolute left-3/4 top-0 bottom-0 border-l border-[var(--border)]" />
        </div>

        {/* Points */}
        {points.map((p) => {
          const x = ((p.score - minScore) / (maxScore - minScore)) * 85 + 5;
          const y = 90 - (p.upside / maxUpside) * 80;
          return (
            <div
              key={p.ticker}
              className="absolute flex flex-col items-center"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="text-[9px] font-bold text-[var(--text-primary)] mb-0.5">
                {p.ticker}
              </span>
              <div
                className="w-[8px] h-[8px] rounded-full"
                style={{ background: "#5e6ad2" }}
              />
            </div>
          );
        })}

        {/* Axis labels */}
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-[var(--text-muted)]">
          Graham Score &rarr;
        </span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-[var(--text-muted)]">
          Upside % &rarr;
        </span>
      </div>
    </div>
  );
}

"use client";

import type { StockCardData } from "./types";

function getUpside(c: StockCardData): number {
  return c.price && c.analystTarget
    ? ((c.analystTarget - c.price) / c.price) * 100
    : 0;
}

export default function TopPicksStrip({ cards }: { cards: StockCardData[] }) {
  const bullish = cards.filter((c) => c.status === "Bullish");
  const topScore = bullish.length
    ? bullish.reduce((a, b) => (b.grahamScore > a.grahamScore ? b : a))
    : null;

  const withUpside = cards.filter((c) => c.price && c.analystTarget);
  const bestUpside = withUpside.length
    ? withUpside.reduce((a, b) => (getUpside(b) > getUpside(a) ? b : a))
    : null;

  const cautious = cards.filter((c) => c.status === "Cautious" || c.status === "Neutral");
  const mostAtRisk = cautious.length
    ? cautious.reduce((a, b) => (a.grahamScore < b.grahamScore ? a : b))
    : null;

  const picks = [
    {
      label: "HIGHEST SCORE",
      icon: "🏆",
      ticker: topScore?.ticker || "—",
      detail: topScore ? `Score ${topScore.grahamScore}` : "",
      color: "#26a86a",
      bg: "rgba(38,168,106,0.10)",
    },
    {
      label: "BEST ANALYST UPSIDE",
      icon: "📈",
      ticker: bestUpside?.ticker || "—",
      detail: bestUpside ? `+${getUpside(bestUpside).toFixed(0)}%` : "",
      color: "#5e6ad2",
      bg: "rgba(94,106,210,0.10)",
    },
    {
      label: "MOST AT RISK",
      icon: "⚠️",
      ticker: mostAtRisk?.ticker || "—",
      detail: mostAtRisk ? `Score ${mostAtRisk.grahamScore}` : "",
      color: "#e05252",
      bg: "rgba(224,82,82,0.10)",
    },
  ];

  return (
    <div className="flex gap-3 mb-5">
      {picks.map((p) => (
        <div
          key={p.label}
          className="flex-1 rounded-lg px-4 py-3 flex items-center gap-3"
          style={{ background: p.bg, border: `1px solid ${p.color}22` }}
        >
          <span className="text-[24px]">{p.icon}</span>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: p.color }}>
              {p.label}
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] font-black text-[var(--text-primary)]">{p.ticker}</span>
              <span className="text-[13px] font-bold" style={{ color: p.color }}>
                {p.detail}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

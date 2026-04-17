"use client";

import type { StockCardData } from "./types";

const statusIcon: Record<string, string> = {
  Bullish: "🐂",
  Neutral: "😐",
  Cautious: "⚠️",
};

const statusColors: Record<string, { dot: string; bg: string }> = {
  Bullish:  { dot: "#26a86a", bg: "rgba(38,168,106,0.10)" },
  Neutral:  { dot: "#e8a045", bg: "rgba(232,160,69,0.10)" },
  Cautious: { dot: "#e05252", bg: "rgba(224,82,82,0.10)" },
};

const themeColors: Record<string, string> = {
  "Direct-to-device satellite": "#6366f1",
  "Space infrastructure": "#8b5cf6",
  "AI diagnostics / healthcare data": "#06b6d4",
  "AI-powered mobile advertising": "#f59e0b",
  "AI operating system for government and enterprise": "#3b82f6",
  "Latin America e-commerce + digital banking": "#10b981",
  "AI public safety platform": "#ef4444",
  "AI-native cybersecurity platform": "#ec4899",
  "Latin America digital banking": "#14b8a6",
  "Voice AI": "#a78bfa",
  "Quantum computing": "#818cf8",
  "AI drug discovery": "#22d3ee",
  "Delivery robotics": "#f97316",
  "Telehealth / GLP-1": "#84cc16",
};

function getThemeColor(theme: string): string {
  return themeColors[theme] || "#5e6ad2";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "#26a86a";
  if (score >= 70) return "#e8a045";
  return "#e05252";
}

export default function StockCard({
  card,
  onClick,
}: {
  card: StockCardData;
  onClick: () => void;
}) {
  const sc = statusColors[card.status] || statusColors.Neutral;
  const themeColor = getThemeColor(card.theme);
  const analystUpside =
    card.price && card.analystTarget
      ? ((card.analystTarget - card.price) / card.price) * 100
      : null;
  const barColor = scoreBarColor(card.grahamScore);
  const barPct = Math.min((card.grahamScore / 100) * 100, 100);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4 flex flex-col gap-2.5 transition-all hover:border-[#3a3a3d] hover:bg-[var(--surface)] cursor-pointer"
      style={{ minWidth: 0 }}
    >
      {/* Row 1: BIG ticker + status icon */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[20px] font-black text-[var(--text-primary)] tracking-tight leading-none">
            {card.ticker}
          </span>
          <span className="text-[16px] leading-none" title={card.status}>
            {statusIcon[card.status] || "❓"}
          </span>
        </div>
        {/* Price */}
        {card.price && (
          <span className="text-[14px] font-bold text-[var(--text-primary)]">
            ${card.price.toFixed(2)}
          </span>
        )}
      </div>

      {/* Row 2: Company name */}
      <div className="text-[11px] text-[var(--text-secondary)] leading-tight truncate">
        {card.company}
      </div>

      {/* Row 3: Score progress bar */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-semibold">
            Score
          </span>
          <span className="text-[13px] font-black" style={{ color: barColor }}>
            {card.grahamScore}
          </span>
        </div>
        <div className="w-full h-[6px] bg-[var(--surface)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${barPct}%`,
              background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
              boxShadow: `0 0 8px ${barColor}44`,
            }}
          />
        </div>
      </div>

      {/* Row 4: Analyst upside — BIG and prominent */}
      {analystUpside !== null && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">Analyst upside</span>
          <span
            className="text-[16px] font-black"
            style={{ color: "#26a86a" }}
          >
            +{analystUpside.toFixed(0)}%
          </span>
        </div>
      )}

      {/* Row 5: Theme tag */}
      <span
        className="inline-block text-[10px] font-semibold px-[8px] py-[2px] rounded self-start truncate max-w-full"
        style={{ background: `${themeColor}18`, color: themeColor }}
      >
        {card.theme}
      </span>

      {/* Row 6: Conviction dots + target */}
      <div className="flex items-center justify-between mt-auto">
        {/* Conviction dots — bigger filled circles */}
        <div className="flex gap-[4px]" title={`Conviction: ${card.conviction}/5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className="w-[8px] h-[8px] rounded-full"
              style={{
                background: i <= card.conviction ? "#5e6ad2" : "#2a2a2d",
                boxShadow: i <= card.conviction ? "0 0 4px rgba(94,106,210,0.4)" : "none",
              }}
            />
          ))}
        </div>
        {/* Target price */}
        {card.analystTarget && (
          <span className="text-[10px] text-[var(--text-muted)]">
            Target ${card.analystTarget.toFixed(0)}
          </span>
        )}
      </div>
    </button>
  );
}

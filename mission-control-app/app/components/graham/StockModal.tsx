"use client";

import { useEffect } from "react";
import type { StockCardData } from "./types";

const statusColors: Record<string, { dot: string; label: string }> = {
  Bullish:  { dot: "#26a86a", label: "Bullish" },
  Neutral:  { dot: "#e8a045", label: "Neutral" },
  Cautious: { dot: "#e05252", label: "Cautious" },
};

export default function StockModal({
  card,
  onClose,
}: {
  card: StockCardData;
  onClose: () => void;
}) {
  const sc = statusColors[card.status] || statusColors.Neutral;
  const analystUpside =
    card.price && card.analystTarget
      ? ((card.analystTarget - card.price) / card.price) * 100
      : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-[var(--panel)] border border-[var(--border)] rounded-xl w-[680px] max-h-[85vh] overflow-y-auto p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-[18px] leading-none"
        >
          &times;
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[24px] font-bold text-[var(--text-primary)]">
            {card.ticker} — {card.company}
          </span>
          <span
            className="w-[9px] h-[9px] rounded-full"
            style={{ background: sc.dot }}
          />
          <span className="text-[12px] text-[var(--text-secondary)]">
            {sc.label}
          </span>
        </div>

        <div className="text-[12px] text-[var(--accent)] mb-4">{card.theme} &middot; {card.status} &middot; Conviction {card.conviction}/5</div>

        {/* Stats row — matches original modal layout */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Current Price" value={card.price ? `$${card.price.toFixed(2)}` : "—"} />
          <MiniStat label="Graham Score" value={`${card.grahamScore} / 100`} />
          <MiniStat label="Analyst Upside" value={analystUpside !== null ? `+${analystUpside.toFixed(0)}%` : "—"} color="#26a86a" />
          <MiniStat label="Conviction" value={"★".repeat(card.conviction) + "☆".repeat(5 - card.conviction)} />
        </div>

        {/* Action zones row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <ZoneCard label="✅ Starter Buy" text={card.starterBuy} color="#26a86a" />
          <ZoneCard label="➕ Add Zone" text={card.addZone} color="#5e6ad2" />
          <ZoneCard label="✂️ Trim Zone" text={card.trimZone} color="#e8a045" />
          <ZoneCard label="📈 Upside (12-24mo)" text={card.upside} color="#26a86a" />
        </div>

        {/* TradingView Chart */}
        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-2">
            Chart
          </div>
          <div className="rounded-lg overflow-hidden">
            <iframe
              src={`https://s.tradingview.com/widgetembed/?frameElementId=tv-chart&symbol=${encodeURIComponent(card.ticker)}&interval=W&hidesidetoolbar=1&hidetoptoolbar=0&symboledit=0&saveimage=0&toolbarbg=161618&studies=[]&theme=dark&style=1&timezone=America%2FChicago&withdateranges=1&showpopupbutton=0&locale=en`}
              style={{ width: "100%", height: 300, border: "none", display: "block", background: "#161618" }}
              loading="lazy"
            />
          </div>
          <p className="text-[10px] text-[#3a3a3d] mt-1">Powered by TradingView</p>
        </div>

        {/* Thesis Break */}
        <Section title="Thesis Break — Exit if:" text={card.thesisBreak} />

        {/* Commentary */}
        <Section title="Commentary" text={card.commentary} />

        {/* Updated */}
        <div className="text-[10px] text-[var(--text-muted)] mt-4 text-right">
          Updated {card.lastUpdated}
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md bg-[var(--surface)] border border-[var(--border)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
        {label}
      </div>
      <div
        className="text-[14px] font-semibold"
        style={{ color: color || "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {title}
      </div>
      <div className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

function ZoneCard({
  label,
  text,
  color,
}: {
  label: string;
  text: string;
  color: string;
}) {
  return (
    <div
      className="rounded-md border px-3 py-2"
      style={{ borderColor: `${color}25`, background: `${color}08` }}
    >
      <div
        className="text-[10px] uppercase tracking-wider font-semibold mb-1"
        style={{ color }}
      >
        {label}
      </div>
      <div className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
        {text}
      </div>
    </div>
  );
}

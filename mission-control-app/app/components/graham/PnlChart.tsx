"use client";

interface Position {
  ticker: string;
  pnl: number;
  pnlPct: number;
  currentValue: number;
  cost: number;
  shares: number;
  entryPrice: number;
  currentPrice: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PnlChart({ positions }: { positions: Position[] }) {
  if (!positions || positions.length === 0) return null;

  const maxAbsPct = Math.max(...positions.map((p) => Math.abs(p.pnlPct)), 1);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5 mb-6">
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-4 font-semibold">
        Portfolio P&L
      </div>

      <div className="flex items-end gap-4 justify-center" style={{ height: "180px" }}>
        {positions.map((p) => {
          const isGain = p.pnl >= 0;
          const barColor = isGain ? "#26a86a" : "#e05252";
          const barBg = isGain ? "rgba(38,168,106,0.15)" : "rgba(224,82,82,0.15)";
          const barHeight = Math.max((Math.abs(p.pnlPct) / maxAbsPct) * 120, 8);

          return (
            <div
              key={p.ticker}
              className="flex flex-col items-center gap-1 flex-1 max-w-[140px]"
              style={{ justifyContent: "flex-end", height: "100%" }}
            >
              {/* P&L value */}
              <span
                className="text-[13px] font-bold"
                style={{ color: barColor }}
              >
                {isGain ? "+" : ""}{fmt(p.pnlPct)}%
              </span>

              {/* Dollar P&L */}
              <span
                className="text-[11px] font-semibold"
                style={{ color: barColor }}
              >
                {isGain ? "+" : ""}${fmt(p.pnl)}
              </span>

              {/* Bar */}
              <div
                className="w-full rounded-t-md transition-all relative"
                style={{
                  height: `${barHeight}px`,
                  background: barColor,
                  boxShadow: `0 0 16px ${barBg}`,
                }}
              >
                {/* Glow effect */}
                <div
                  className="absolute inset-0 rounded-t-md"
                  style={{ background: `linear-gradient(to top, ${barColor}, transparent)`, opacity: 0.3 }}
                />
              </div>

              {/* Ticker */}
              <span className="text-[16px] font-black text-[var(--text-primary)] mt-1">
                {p.ticker}
              </span>

              {/* Price info */}
              <span className="text-[10px] text-[var(--text-muted)]">
                {p.shares} @ ${fmt(p.entryPrice)}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">
                Now ${fmt(p.currentPrice)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Zero line */}
      <div className="border-t border-[var(--border)] mt-2" />
    </div>
  );
}

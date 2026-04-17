"use client";

import { useState, useEffect, useRef } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface Position {
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price: number;
  sector: string;
  market_value: number;
  cost_basis: number;
  pnl: number;
  pnl_pct: number;
  live_price?: number;
}

interface Summary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  numPositions: number;
  lastUpdated: string;
}

interface Sector {
  name: string;
  value: number;
  pnl: number;
  pct: number;
}

interface PortfolioData {
  positions: Position[];
  summary: Summary | null;
  sectors: Sector[];
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt$(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// Color: green for gain, red for loss. Intensity scales with magnitude.
function heatColor(pnlPct: number): string {
  const clamped = Math.max(-40, Math.min(40, pnlPct));
  if (clamped >= 0) {
    // 0→+40%: dark green → vivid green
    const t = clamped / 40;
    const r = Math.round(10 + (10 - 10) * t);
    const g = Math.round(40 + (230 - 40) * t);
    const b = Math.round(20 + (50 - 20) * t);
    const alpha = 0.25 + t * 0.7;
    return `rgba(${r},${g},${b},${alpha})`;
  } else {
    // 0→-40%: dark red → vivid red
    const t = Math.abs(clamped) / 40;
    const r = Math.round(40 + (220 - 40) * t);
    const g = Math.round(10 + (30 - 10) * t);
    const b = Math.round(10 + (30 - 10) * t);
    const alpha = 0.25 + t * 0.7;
    return `rgba(${r},${g},${b},${alpha})`;
  }
}

function borderColor(pnlPct: number): string {
  if (pnlPct >= 5) return "rgba(38,168,106,0.7)";
  if (pnlPct >= 0) return "rgba(38,168,106,0.35)";
  if (pnlPct >= -5) return "rgba(220,60,60,0.35)";
  return "rgba(220,60,60,0.7)";
}

function textColor(pnlPct: number): string {
  if (pnlPct >= 10) return "#5dff9d";
  if (pnlPct >= 0) return "#6ee7a0";
  if (pnlPct >= -10) return "#f87171";
  return "#ff4545";
}

/* ─── Tooltip ────────────────────────────────────────────────────────────── */

interface TooltipState {
  pos: Position;
  x: number;
  y: number;
}

function Tooltip({ tip }: { tip: TooltipState }) {
  const { pos, x, y } = tip;
  const pnlColor = pos.pnl >= 0 ? "#6ee7a0" : "#f87171";
  return (
    <div
      style={{
        position: "fixed",
        left: x + 14,
        top: y - 10,
        zIndex: 9999,
        pointerEvents: "none",
        transform: x > window.innerWidth - 260 ? "translateX(-110%)" : undefined,
      }}
      className="bg-[#1e1e22] border border-[#2a2a2d] rounded-lg shadow-xl p-3 w-[220px] text-[12px]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[15px] font-bold text-white">{pos.ticker}</span>
        <span className="text-[11px] text-[#8b8b91] font-medium">{pos.sector}</span>
      </div>
      <div className="space-y-1">
        <Row label="Shares" value={pos.shares.toLocaleString()} />
        <Row label="Avg Cost" value={`$${pos.avg_cost.toFixed(2)}`} />
        <Row label="Current" value={`$${pos.current_price.toFixed(2)}`} highlight />
        <Row label="Market Value" value={fmt$(pos.market_value)} />
        <div className="border-t border-[#2a2a2d] my-1.5" />
        <Row label="P&L $" value={fmt$(pos.pnl)} color={pnlColor} />
        <Row label="P&L %" value={fmtPct(pos.pnl_pct)} color={pnlColor} />
      </div>
      {pos.live_price && (
        <div className="mt-2 text-[10px] text-[#5e6ad2]">● Live price</div>
      )}
    </div>
  );
}

function Row({ label, value, color, highlight }: { label: string; value: string; color?: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#8b8b91]">{label}</span>
      <span style={{ color: color ?? (highlight ? "#e8e8ea" : "#c5c5cb") }} className="font-medium">{value}</span>
    </div>
  );
}

/* ─── Tile ───────────────────────────────────────────────────────────────── */

function HeatTile({
  pos,
  totalValue,
  onHover,
  onLeave,
}: {
  pos: Position;
  totalValue: number;
  onHover: (p: Position, e: MouseEvent) => void;
  onLeave: () => void;
}) {
  const weight = totalValue > 0 ? pos.market_value / totalValue : 0;
  // Min 70px, max 260px height based on weight
  const h = Math.max(70, Math.min(260, 70 + weight * 1800));
  const bg = heatColor(pos.pnl_pct);
  const border = borderColor(pos.pnl_pct);
  const pctColor = textColor(pos.pnl_pct);

  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      style={{
        background: bg,
        border: `1px solid ${border}`,
        height: `${h}px`,
        flex: `1 1 ${Math.max(90, weight * 300)}px`,
        minWidth: "80px",
        maxWidth: "260px",
      }}
      className="rounded-lg p-2.5 cursor-default relative overflow-hidden transition-all duration-150 hover:scale-[1.02] hover:z-10"
      onMouseEnter={(e) => onHover(pos, e.nativeEvent)}
      onMouseMove={(e) => onHover(pos, e.nativeEvent)}
      onMouseLeave={onLeave}
    >
      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 20px,rgba(255,255,255,.4) 20px,rgba(255,255,255,.4) 21px),repeating-linear-gradient(90deg,transparent,transparent 20px,rgba(255,255,255,.4) 20px,rgba(255,255,255,.4) 21px)",
        }}
      />

      <div className="relative z-10 h-full flex flex-col justify-between">
        <div>
          <div className="text-white font-bold text-[14px] leading-tight tracking-wide">{pos.ticker}</div>
          {h > 100 && (
            <div className="text-[10px] text-[#8b8b91] mt-0.5">{pos.shares} shares</div>
          )}
        </div>
        <div>
          {h > 90 && (
            <div className="text-[11px] text-[#c5c5cb] mb-0.5">{fmt$(pos.market_value)}</div>
          )}
          <div style={{ color: pctColor }} className="font-semibold text-[12px]">
            {fmtPct(pos.pnl_pct)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sector Bar ─────────────────────────────────────────────────────────── */

const SECTOR_COLORS = [
  "#5e6ad2", "#26a86a", "#e3813b", "#e35b5b",
  "#9b59b6", "#3bc0e3", "#e3c13b", "#e35b9b",
];

function SectorBars({ sectors }: { sectors: Sector[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sectors.map((s, i) => {
        const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
        const pnlColor = s.pnl >= 0 ? "#6ee7a0" : "#f87171";
        return (
          <div
            key={s.name}
            className="flex items-center gap-2 bg-[#1a1a1e] border border-[#2a2a2d] rounded-full px-3 py-1.5 text-[11px]"
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color }}
            />
            <span className="text-[#c5c5cb] font-medium">{s.name}</span>
            <span className="text-[#8b8b91]">{s.pct.toFixed(1)}%</span>
            <span style={{ color: pnlColor }} className="font-semibold">{(s.value - s.pnl) > 0 ? fmtPct(s.pnl / (s.value - s.pnl) * 100) : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/portfolio");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: PortfolioData = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleHover = (pos: Position, e: MouseEvent) => {
    setTooltip({ pos, x: e.clientX, y: e.clientY });
  };

  // Group by sector
  const bySector = data?.positions.reduce((acc, p) => {
    (acc[p.sector] = acc[p.sector] ?? []).push(p);
    return acc;
  }, {} as Record<string, Position[]>) ?? {};

  const totalValue = data?.summary?.totalValue ?? 1;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#5e6ad2] border-t-transparent rounded-full animate-spin" />
          <span className="text-[13px] text-[#8b8b91]">Loading portfolio…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#f87171] text-[14px] font-medium mb-2">Failed to load portfolio</div>
          <div className="text-[#8b8b91] text-[12px] mb-4">{error}</div>
          <button onClick={load} className="text-[12px] text-[#5e6ad2] hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="min-h-screen bg-[#0f0f10] text-white p-6">
      {tooltip && <Tooltip tip={tooltip} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#e8e8ea] tracking-tight">Portfolio Heat Map</h1>
          <p className="text-[12px] text-[#8b8b91] mt-0.5">
            Sector exposure · concentration risk · P&amp;L at a glance
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1e] border border-[#2a2a2d] rounded-[6px] text-[12px] text-[#8b8b91] hover:text-[#e8e8ea] hover:border-[#3a3a3d] transition-colors"
        >
          <span>↻</span>
          <span>{lastRefresh ? `${lastRefresh.toLocaleTimeString()}` : "Refresh"}</span>
        </button>
      </div>

      {/* Summary Bar */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Total Value" value={fmt$(s.totalValue)} />
          <SummaryCard
            label="Total P&L"
            value={fmt$(s.totalPnl)}
            color={s.totalPnl >= 0 ? "#6ee7a0" : "#f87171"}
          />
          <SummaryCard
            label="P&L %"
            value={fmtPct(s.totalPnlPct)}
            color={s.totalPnlPct >= 0 ? "#6ee7a0" : "#f87171"}
          />
          <SummaryCard label="Positions" value={String(s.numPositions)} />
        </div>
      )}

      {/* Sector Pills */}
      {data?.sectors && data.sectors.length > 0 && (
        <div className="mb-5">
          <div className="text-[11px] font-semibold text-[#55555c] uppercase tracking-widest mb-2">
            Sector Breakdown
          </div>
          <SectorBars sectors={data.sectors} />
        </div>
      )}

      {/* Heat Map */}
      {data?.positions && data.positions.length > 0 ? (
        <div className="space-y-5">
          {Object.entries(bySector)
            .sort(([, a], [, b]) =>
              b.reduce((s, p) => s + p.market_value, 0) -
              a.reduce((s, p) => s + p.market_value, 0)
            )
            .map(([sector, positions]) => {
              const sectorValue = positions.reduce((s, p) => s + p.market_value, 0);
              const sectorPnl = positions.reduce((s, p) => s + p.pnl, 0);
              return (
                <div key={sector}>
                  {/* Sector label */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[12px] font-semibold text-[#8b8b91] uppercase tracking-widest">
                      {sector}
                    </span>
                    <span className="text-[11px] text-[#55555c]">{fmt$(sectorValue)}</span>
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: sectorPnl >= 0 ? "#6ee7a0" : "#f87171" }}
                    >
                      {sectorPnl >= 0 ? "+" : ""}{fmt$(sectorPnl)}
                    </span>
                    <div className="flex-1 h-px bg-[#1e1e22]" />
                  </div>

                  {/* Tiles */}
                  <div className="flex flex-wrap gap-2">
                    {positions
                      .sort((a, b) => b.market_value - a.market_value)
                      .map((pos) => (
                        <HeatTile
                          key={pos.ticker}
                          pos={pos}
                          totalValue={totalValue}
                          onHover={handleHover}
                          onLeave={() => setTooltip(null)}
                        />
                      ))}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-[40px] mb-3">📊</div>
          <div className="text-[15px] font-medium text-[#e8e8ea] mb-1">No positions</div>
          <div className="text-[12px] text-[#8b8b91]">
            Add positions to data/portfolio.json or open a trade in Graham.
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 flex items-center gap-4 flex-wrap">
        <span className="text-[10px] text-[#55555c] uppercase tracking-widest">P&L Legend</span>
        {[
          { label: "+20%+", color: "rgba(10,230,50,0.85)" },
          { label: "+5%", color: "rgba(30,140,50,0.6)" },
          { label: "Flat", color: "rgba(50,50,60,0.6)" },
          { label: "−5%", color: "rgba(150,30,30,0.6)" },
          { label: "−20%+", color: "rgba(220,30,30,0.85)" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-4 h-4 rounded-sm border border-[#3a3a3d]"
              style={{ background: color }}
            />
            <span className="text-[10px] text-[#8b8b91]">{label}</span>
          </div>
        ))}
        <span className="text-[10px] text-[#55555c]">· Tile size = position value</span>
      </div>
    </div>
  );
}

/* ─── Summary Card ───────────────────────────────────────────────────────── */
function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg px-4 py-3">
      <div className="text-[10px] text-[#55555c] uppercase tracking-widest mb-1">{label}</div>
      <div
        className="text-[20px] font-bold leading-tight"
        style={{ color: color ?? "#e8e8ea" }}
      >
        {value}
      </div>
    </div>
  );
}

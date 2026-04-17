"use client";

import { useEffect, useState } from "react";

interface Position {
  ticker: string;
  company: string;
  type: string; // "LONG" | "SHORT"
  entryDate: string;
  entryTime: string;
  entryPrice: number;
  shares: number;
  positionSize: number;
  positionPct: string;
  stopLoss: number;
  stopLossPct: string;
  target1: number;
  target2: number;
  status: string;
  catalyst: string;
  trailingStop: boolean;
  notes: string;
}

interface Trade {
  time: string;
  ticker: string;
  side: string;
  shares: number;
  price: number;
  pnl?: number;
  direction?: string; // "LONG" | "SHORT"
}

interface DayTradesData {
  account: string;
  portfolioSize: number;
  cash: number;
  deployed: number;
  positions: Position[];
  trades: Trade[];
  rules: Record<string, string | number | boolean>;
  grahamNote: string;
  lastUpdated: string;
  watchlist?: (string | { ticker: string; note: string })[];
}

export default function DayTradingPage() {
  const [data, setData] = useState<DayTradesData | null>(null);

  useEffect(() => {
    fetch("/api/day-trades")
      .then((r) => r.json())
      .then(setData);
    const iv = setInterval(() => {
      fetch("/api/day-trades")
        .then((r) => r.json())
        .then(setData);
    }, 15000);
    return () => clearInterval(iv);
  }, []);

  if (!data) {
    return (
      <div className="p-8 max-w-[1200px]">
        <p className="text-[#55555c] text-[13px]">Loading day trades…</p>
      </div>
    );
  }

  const closedPnl = data.trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const openPositions = data.positions.filter((p) => p.status === "OPEN");
  const shortCount = openPositions.filter((p) => p.type === "SHORT").length;

  // Extract watchlist from Graham's note
  const rawWatchlist = data.watchlist;
  const watchlist: { ticker: string; note: string }[] = rawWatchlist
    ? rawWatchlist.map((w) =>
        typeof w === "string" ? { ticker: w, note: "" } : w
      )
    : extractWatchlist(data.grahamNote);

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-semibold text-[#e8e8ea]">
          Day Trading ⚡
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-[12px] bg-[#5e6ad2]/15 text-[#5e6ad2] px-3 py-1 rounded-full font-medium">
            {data.account}
          </span>
          <a href="/" className="text-[12px] bg-[#1c1c1f] border border-[#2a2a2d] text-[#8b8b91] px-3 py-1 rounded-md hover:border-[#5e6ad2] hover:text-[#e8e8ea] transition-colors">
            ← Dashboard
          </a>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatTile label="Capital" value={fmt(data.portfolioSize)} />
        <StatTile label="Cash Available" value={fmt(data.cash)} />
        <StatTile label="Deployed" value={fmt(data.deployed)} />
        <StatTile
          label="Shorts"
          value={String(shortCount)}
          color={shortCount > 0 ? "#e05252" : "#55555c"}
        />
        <StatTile
          label="Today's P&L"
          value={fmt(closedPnl)}
          color={closedPnl >= 0 ? "#26a86a" : "#e05252"}
          large
        />
      </div>

      {/* Open Positions */}
      <SectionHeader>Open Positions</SectionHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        {openPositions.map((p) => (
          <PositionCard key={p.ticker} pos={p} />
        ))}
        {openPositions.length === 0 && (
          <p className="text-[#55555c] text-[13px] col-span-2">
            No open positions
          </p>
        )}
      </div>

      {/* Today's Trades */}
      <SectionHeader>Today&apos;s Trades</SectionHeader>
      {data.trades.length > 0 ? (
        <div className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-md mb-6 overflow-hidden">
          {data.trades.map((t, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 border-b border-[#2a2a2d] last:border-b-0"
            >
              <span className="text-[12px] text-[#55555c] w-[70px] font-mono">
                {t.time}
              </span>
              <span className="text-[14px] font-semibold text-[#e8e8ea] w-[60px]">
                {t.ticker}
              </span>
              {/* Direction badge */}
              {t.direction && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    t.direction === "LONG"
                      ? "bg-[#26a86a]/15 text-[#26a86a]"
                      : "bg-[#e05252]/15 text-[#e05252]"
                  }`}
                >
                  {t.direction === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
                </span>
              )}
              {/* Side badge */}
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  t.side === "BUY"
                    ? "bg-[#26a86a]/15 text-[#26a86a]"
                    : "bg-[#e05252]/15 text-[#e05252]"
                }`}
              >
                {t.side}
              </span>
              <span className="text-[13px] text-[#8b8b91]">
                {t.shares} shares
              </span>
              <span className="text-[13px] text-[#e8e8ea] font-mono">
                ${t.price.toFixed(2)}
              </span>
              {t.pnl !== undefined && (
                <span
                  className={`ml-auto text-[14px] font-semibold ${
                    t.pnl >= 0 ? "text-[#26a86a]" : "text-[#e05252]"
                  }`}
                >
                  {t.pnl >= 0 ? "+" : ""}
                  {fmt(t.pnl)}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[#55555c] text-[13px] mb-6">
          No completed trades today
        </p>
      )}

      {/* Watchlist */}
      <SectionHeader>Watchlist</SectionHeader>
      {watchlist.length > 0 ? (
        <div className="flex gap-2 flex-wrap mb-6">
          {watchlist.map((w) => (
            <div
              key={w.ticker}
              className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-md px-4 py-3 min-w-[140px]"
            >
              <div className="text-[15px] font-semibold text-[#e8e8ea]">
                {w.ticker}
              </div>
              <div className="text-[11px] text-[#55555c] mt-1">{w.note}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[#55555c] text-[13px] mb-6">
          No watchlist entries today
        </p>
      )}

      {/* Rules Strip */}
      <div className="fixed bottom-0 left-[220px] right-0 bg-[#161618] border-t border-[#2a2a2d] px-6 py-2.5 flex items-center gap-6 text-[12px] font-medium z-40">
        <span className="text-[#e05252]">⛔ Max 3% loss</span>
        <span className="text-[#5e6ad2]">📊 Max 20% position</span>
        <span className="text-[#e8a045]">🚫 No overnight holds</span>
        <span className="text-[#e05252]">🛑 Stop at -6% account</span>
        <span className="text-[#e05252]">🩳 Max 20% per short</span>
        <span className="text-[#e8a045]">🌙 No overnight shorts without stop</span>
        <span className="ml-auto text-[#55555c]">
          Updated {new Date(data.lastUpdated).toLocaleTimeString()}
        </span>
      </div>

      {/* Bottom padding for rules strip */}
      <div className="h-12" />
    </div>
  );
}

/* ── helpers ── */

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-medium text-[#8b8b91] uppercase tracking-wider mb-3">
      {children}
    </h2>
  );
}

function StatTile({
  label,
  value,
  color,
  large,
}: {
  label: string;
  value: string;
  color?: string;
  large?: boolean;
}) {
  return (
    <div className="bg-[#1c1c1f] border border-[#2a2a2d] rounded-md px-4 py-4">
      <div className="text-[11px] text-[#55555c] uppercase tracking-wider mb-1">
        {label}
      </div>
      <div
        className={`font-semibold ${large ? "text-[26px]" : "text-[20px]"}`}
        style={{ color: color ?? "#e8e8ea" }}
      >
        {value}
      </div>
    </div>
  );
}

function PositionCard({ pos }: { pos: Position }) {
  const isShort = pos.type === "SHORT";
  const borderColor = isShort ? "border-l-[#e05252]" : "border-l-[#26a86a]";
  const directionEmoji = isShort ? "🔴" : "🟢";

  return (
    <div className={`bg-[#1c1c1f] border border-[#2a2a2d] border-l-4 ${borderColor} rounded-md p-4`}>
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[18px] font-bold text-[#e8e8ea]">
            {pos.ticker}
          </span>
          <span
            className={`text-[11px] font-bold px-2 py-0.5 rounded ${
              isShort
                ? "bg-[#e05252]/15 text-[#e05252]"
                : "bg-[#26a86a]/15 text-[#26a86a]"
            }`}
          >
            {directionEmoji} {pos.type}
          </span>
        </div>
        <span className="text-[11px] text-[#55555c]">{pos.positionPct} of account</span>
      </div>

      {/* Company name */}
      <div className="text-[12px] text-[#55555c] mb-3">{pos.company}</div>

      {/* Numbers grid */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-[#55555c] uppercase">Shares</div>
          <div className="text-[16px] font-semibold text-[#e8e8ea]">
            {pos.shares}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#55555c] uppercase">Entry</div>
          <div className="text-[16px] font-semibold text-[#e8e8ea]">
            ${pos.entryPrice.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#55555c] uppercase">Position</div>
          <div className="text-[16px] font-semibold text-[#e8e8ea]">
            {fmt(pos.positionSize)}
          </div>
        </div>
      </div>

      {/* Stop & Targets — labels flip semantics for shorts */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-[#e05252] uppercase">Stop Loss</div>
          <div className="text-[15px] font-semibold text-[#e05252]">
            ${pos.stopLoss.toFixed(2)}{" "}
            <span className="text-[11px]">({pos.stopLossPct})</span>
          </div>
        </div>
        <div>
          {/* For shorts: target = price falls to this level */}
          <div className={`text-[10px] uppercase ${isShort ? "text-[#26a86a]" : "text-[#26a86a]"}`}>
            {isShort ? "Cover T1" : "Target 1"}
          </div>
          <div className="text-[15px] font-semibold text-[#26a86a]">
            ${pos.target1.toFixed(2)}
          </div>
        </div>
        <div>
          <div className={`text-[10px] uppercase ${isShort ? "text-[#26a86a]" : "text-[#26a86a]"}`}>
            {isShort ? "Cover T2" : "Target 2"}
          </div>
          <div className="text-[15px] font-semibold text-[#26a86a]">
            ${pos.target2.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Short P&L note */}
      {isShort && (
        <div className="text-[10px] text-[#e05252] mb-2 font-medium">
          ↓ Profit when price falls · Loss when price rises
        </div>
      )}

      {/* Catalyst */}
      <div className="text-[11px] text-[#8b8b91] leading-relaxed bg-[#161618] rounded px-3 py-2">
        {pos.catalyst}
      </div>
    </div>
  );
}

function extractWatchlist(note: string): { ticker: string; note: string }[] {
  const items: { ticker: string; note: string }[] = [];
  // Parse "WATCH ONLY" section from Graham's note
  const watchMatch = note.match(/WATCH ONLY[^\n]*\n([\s\S]*?)(?:\n---|\n\n---)/);
  if (watchMatch) {
    const lines = watchMatch[1].split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const m = line.match(/([A-Z]{2,5})\s.*?[—–-]\s*(.*)/);
      if (m) {
        items.push({ ticker: m[1], note: m[2].trim() });
      }
    }
  }
  return items;
}

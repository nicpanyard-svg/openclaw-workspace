"use client";

import { useState, useEffect, useRef } from "react";
import DayTradingPage from "../day-trading/page";

/* ---------- Types ---------- */

interface LTPosition {
  ticker: string;
  action: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  currentValue: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  reasoning: string;
}

interface Trade {
  date: string;
  ticker: string;
  action: string;
  shares: number;
  price: number;
  total: number;
  note: string;
}

interface Passed {
  ticker: string;
  reason: string;
}

interface LTPortfolio {
  portfolioValue: number;
  cash: number;
  deployedPct: number;
  totalPnl: number;
  totalPnlPct: number;
  positions: LTPosition[];
  trades: Trade[];
  passed: Passed[];
  lastUpdated: string;
}

interface EarningsEntry {
  ticker: string;
  nextEarningsDate: string | null;
  daysUntil: number | null;
  earningsSoon: boolean;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  lastBeat: boolean | null;
  lastSurprisePct: number | null;
  error: string | null;
}

interface EarningsCalendar {
  lastUpdated: string;
  count: number;
  earningsSoonCount: number;
  data: EarningsEntry[];
}

/* ---------- Helpers ---------- */

function fmt(n: number | undefined | null) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRevenue(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function PnlText({ value, suffix = "" }: { value: number; suffix?: string }) {
  const color = value >= 0 ? "#26a86a" : "#e05252";
  const sign = value >= 0 ? "+" : "";
  return <span style={{ color, fontWeight: 600 }}>{sign}{fmt(value)}{suffix}</span>;
}

/* ---------- Earnings Badge Component ---------- */

function EarningsBadge({ entry }: { entry: EarningsEntry | undefined }) {
  const [hovered, setHovered] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  if (!entry || !entry.nextEarningsDate) return null;

  const { daysUntil, earningsSoon, epsEstimate, revenueEstimate, lastBeat, lastSurprisePct } = entry;

  // Badge style
  let badgeBg = "#2a2a2d";
  let badgeColor = "#888";
  let badgeBorder = "#3a3a3d";
  let badgeLabel = `📅 In ${daysUntil}d`;

  if (earningsSoon) {
    badgeBg = "rgba(255,140,0,0.12)";
    badgeColor = "#ff8c00";
    badgeBorder = "rgba(255,140,0,0.35)";
    badgeLabel = `🗓️ Earnings in ${daysUntil}d`;
  } else if (daysUntil !== null && daysUntil <= 30) {
    badgeBg = "rgba(100,100,115,0.12)";
    badgeColor = "#666";
    badgeBorder = "#333";
    badgeLabel = `📅 In ${daysUntil}d`;
  }

  const hasTooltipContent = epsEstimate != null || revenueEstimate != null || lastBeat != null;

  return (
    <div className="relative inline-block" style={{ position: "relative" }}>
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded cursor-default select-none"
        style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}` }}
        onMouseEnter={() => hasTooltipContent && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {badgeLabel}
      </span>
      {hovered && hasTooltipContent && (
        <div
          ref={tooltipRef}
          className="absolute z-50 rounded-md p-3 text-[11px] shadow-lg"
          style={{
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a1a1d",
            border: "1px solid #3a3a3d",
            minWidth: 160,
            pointerEvents: "none",
          }}
        >
          <div className="font-semibold text-[var(--text-primary)] mb-1.5">Earnings Preview</div>
          {epsEstimate != null && (
            <div className="flex justify-between gap-4 mb-0.5">
              <span className="text-[var(--text-muted)]">EPS Est.</span>
              <span className="text-[var(--text-primary)] font-semibold">${epsEstimate.toFixed(2)}</span>
            </div>
          )}
          {revenueEstimate != null && (
            <div className="flex justify-between gap-4 mb-0.5">
              <span className="text-[var(--text-muted)]">Rev Est.</span>
              <span className="text-[var(--text-primary)] font-semibold">{fmtRevenue(revenueEstimate)}</span>
            </div>
          )}
          {lastBeat != null && (
            <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-[#333]">
              <span className="text-[var(--text-muted)]">Last Q</span>
              <span style={{ color: lastBeat ? "#26a86a" : "#e05252", fontWeight: 600 }}>
                {lastBeat ? "✅ Beat" : "❌ Miss"}
                {lastSurprisePct != null && ` ${lastSurprisePct > 0 ? "+" : ""}${lastSurprisePct.toFixed(1)}%`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Next Earnings Widget ---------- */

function NextEarningsWidget({ earnings }: { earnings: EarningsCalendar | null }) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/earnings", { method: "POST" });
      window.location.reload();
    } catch (_) {
      setRefreshing(false);
    }
  }

  if (!earnings) return null;

  const upcoming = earnings.data
    .filter((e) => e.nextEarningsDate && e.daysUntil !== null && e.daysUntil >= 0)
    .slice(0, 3);

  if (upcoming.length === 0) return null;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "#161618", borderColor: "#2a2a2d" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
          <span>📅</span> Next Earnings
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-[10px] px-2 py-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          style={{ background: "#2a2a2d", border: "1px solid #3a3a3d" }}
          title="Refresh earnings data"
        >
          {refreshing ? "⟳" : "↺ Refresh"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {upcoming.map((e) => {
          const isSoon = e.earningsSoon;
          const color = isSoon ? "#ff8c00" : "#555";
          return (
            <div key={e.ticker} className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-[var(--text-primary)]">{e.ticker}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)]">{e.nextEarningsDate}</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ color, background: isSoon ? "rgba(255,140,0,0.1)" : "transparent" }}
                >
                  {e.daysUntil}d
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {earnings.earningsSoonCount > 0 && (
        <div className="mt-3 pt-2 border-t border-[#2a2a2d] text-[11px]" style={{ color: "#ff8c00" }}>
          ⚠️ {earnings.earningsSoonCount} stock{earnings.earningsSoonCount > 1 ? "s" : ""} reporting in ≤7 days
        </div>
      )}
    </div>
  );
}

/* ---------- Page ---------- */

export default function StocksPage() {
  const [lt, setLt] = useState<LTPortfolio | null>(null);
  const [earnings, setEarnings] = useState<EarningsCalendar | null>(null);

  useEffect(() => {
    fetch("/api/portfolio").then((r) => r.json()).then(setLt).catch(() => {});
    fetch("/api/earnings").then((r) => r.json()).then(setEarnings).catch(() => {});
  }, []);

  // Build earnings lookup map: ticker -> EarningsEntry
  const earningsMap = new Map<string, EarningsEntry>();
  if (earnings) {
    earnings.data.forEach((e) => earningsMap.set(e.ticker, e));
  }

  const [activeTab, setActiveTab] = useState<"longterm" | "daytrading">("longterm");

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-semibold text-[var(--text-primary)]">📈 Graham</h1>
        <div className="flex items-center gap-2">
          <a
            href="/scores"
            className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold"
            style={{ background: "#2a2a2d", color: "#e8e8ea", border: "1px solid #3a3a3d" }}
          >
            🧠 Scores
          </a>
          <a
            href="/graham-board/index.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold"
            style={{ background: "#5e6ad2", color: "#fff" }}
          >
            Open Full Board ↗
          </a>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-[#161618] border border-[#2a2a2d] rounded-[8px] p-1 w-fit">
        {([["longterm", "📈 Long-Term Portfolio"], ["daytrading", "⚡ Day Trading"]] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-2 rounded-[6px] text-[13px] font-semibold transition-all"
            style={{
              background: activeTab === tab ? "#2a2a2d" : "transparent",
              color: activeTab === tab ? "#e8e8ea" : "#55555c",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "daytrading" && <DayTradingPage />}
      {activeTab === "longterm" && <>

      {/* ===== Long-Term Buys Stats + Next Earnings Widget ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4 mb-8">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span style={{ fontSize: 18 }}>📈</span> Long-Term Buys
          </div>
          <div className="grid grid-cols-4 gap-3">
            <MiniStat label="Portfolio Value" value={lt ? `$${fmt(lt.portfolioValue)}` : "\u2014"} />
            <MiniStat label="Cash" value={lt ? `$${fmt(lt.cash)}` : "\u2014"} />
            <MiniStat label="Deployed" value={lt ? `${fmt(lt.deployedPct)}%` : "\u2014"} />
            <MiniStat
              label="Total P&L"
              value={lt ? <PnlText value={lt.totalPnl} /> : "\u2014"}
              sub={lt ? <PnlText value={lt.totalPnlPct} suffix="%" /> : null}
            />
          </div>
        </div>
        <NextEarningsWidget earnings={earnings} />
      </div>

      {/* ===== Long-Term Positions ===== */}
      <SectionHeader emoji="📈" title="Long-Term Positions" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {lt?.positions?.length ? (
          lt.positions.map((p) => (
            <LTPositionCard
              key={p.ticker}
              pos={p}
              earningsEntry={earningsMap.get(p.ticker)}
            />
          ))
        ) : (
          <Empty text="No long-term positions" />
        )}
      </div>

      {/* ===== Trade History ===== */}
      <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">Trade History</h2>
      <TradeList trades={lt?.trades} />

      {/* ===== Passed ===== */}
      {lt?.passed?.length ? (
        <>
          <h2 className="text-[15px] font-semibold text-[var(--text-secondary)] mb-3 mt-2">Passed</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {lt.passed.map((p) => (
              <div
                key={p.ticker}
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-3 flex items-start gap-3"
              >
                <span className="text-[14px] font-bold text-[var(--text-primary)] shrink-0">{p.ticker}</span>
                <span className="text-[13px] text-[var(--text-muted)] leading-relaxed">{p.reason}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      </>}
    </div>
  );
}

/* ========== Sub-components ========== */

function MiniStat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">{label}</div>
      <div className="text-[22px] font-semibold text-[var(--text-primary)] leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">{sub}</div>}
    </div>
  );
}

function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
      <span>{emoji}</span> {title}
    </h2>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="col-span-3 text-[var(--text-muted)] text-[13px] py-6">{text}</div>;
}

function LTPositionCard({ pos, earningsEntry }: { pos: LTPosition; earningsEntry?: EarningsEntry }) {
  const green = pos.pnl >= 0;
  const accent = green ? "#26a86a" : "#e05252";
  const bg = green ? "rgba(38,168,106,0.08)" : "rgba(224,82,82,0.08)";

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-bold text-[var(--text-primary)]">{pos.ticker}</span>
        <div className="flex items-center gap-2">
          {earningsEntry && <EarningsBadge entry={earningsEntry} />}
          <span
            className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
            style={{ background: bg, color: accent }}
          >
            {pos.action}
          </span>
        </div>
      </div>

      <div className="flex items-baseline gap-2">
        <span style={{ color: accent, fontSize: 24, fontWeight: 700 }}>
          {green ? "+" : ""}{fmt(pos.pnl)}
        </span>
        <span style={{ color: accent, fontSize: 14, fontWeight: 600 }}>
          {green ? "+" : ""}{fmt(pos.pnlPct)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        <Detail label="Shares" value={String(pos.shares)} />
        <Detail label="Entry" value={`$${fmt(pos.entryPrice)}`} />
        <Detail label="Current" value={`$${fmt(pos.currentPrice)}`} />
        <Detail label="Value" value={`$${fmt(pos.currentValue)}`} />
      </div>
    </div>
  );
}

function TradeList({ trades }: { trades?: Trade[] }) {
  if (!trades?.length) {
    return <div className="text-[var(--text-muted)] text-[13px] py-4 mb-8">No trades yet</div>;
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] overflow-hidden mb-8">
      {trades.map((t, i) => {
        const actionColor =
          t.action === "BUY" ? "#26a86a" :
          t.action === "SELL" ? "#e05252" :
          t.action === "ADD" ? "#26a86a" :
          t.action === "TRIM" ? "#d4a017" :
          t.action === "RESET" ? "#d4a017" : "var(--text-secondary)";
        return (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)] last:border-b-0"
          >
            <span className="text-[12px] text-[var(--text-muted)] w-[80px] shrink-0">{t.date}</span>
            <span
              className="text-[11px] font-bold uppercase px-2 py-0.5 rounded w-[52px] text-center shrink-0"
              style={{ background: `${actionColor}18`, color: actionColor }}
            >
              {t.action}
            </span>
            <span className="text-[14px] font-bold text-[var(--text-primary)] w-[60px] shrink-0">{t.ticker}</span>
            <span className="text-[13px] text-[var(--text-secondary)]">
              {t.shares ? `${t.shares} shares` : ""}
              {t.price ? ` @ $${fmt(t.price)}` : ""}
              {t.total ? ` = $${fmt(t.total)}` : ""}
            </span>
            {t.note && <span className="text-[12px] text-[var(--text-muted)] ml-auto truncate max-w-[280px]">{t.note}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

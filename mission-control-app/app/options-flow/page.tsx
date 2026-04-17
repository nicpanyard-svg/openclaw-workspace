"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface UnusualContract {
  symbol: string;
  strike: number;
  expiry: string;
  type: "call" | "put";
  volume: number;
  openInterest: number;
  iv: number | null;
  volOiRatio: number;
  inTheMoney: boolean;
  lastPrice: number;
  bid: number;
  ask: number;
}

interface HighestIV {
  symbol: string;
  strike: number;
  expiry: string;
  type: string;
  iv: number;
}

interface StockFlow {
  ticker: string;
  fetchedAt: string;
  error?: string;
  summary?: {
    putCallRatio: number | null;
    totalCallOI: number;
    totalPutOI: number;
    totalCallVolume: number;
    totalPutVolume: number;
    avgOI: number;
    totalContracts: number;
    expirationDates: number;
  };
  unusualActivity: boolean;
  unusualFlags: string[];
  unusualContracts: UnusualContract[];
  highestIVStrike: HighestIV | null;
}

interface FlowData {
  generatedAt: string;
  disclaimer: string;
  tickers: string[];
  stocks: StockFlow[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function pcRatioColor(ratio: number | null): string {
  if (ratio == null) return "#8b8b91";
  if (ratio < 0.5) return "#26a86a"; // bullish call dominance
  if (ratio > 2.0) return "#e05454"; // bearish put dominance
  if (ratio < 0.75) return "#5db55d";
  if (ratio > 1.5) return "#e07f54";
  return "#e8e8ea";
}

function pcRatioLabel(ratio: number | null): string {
  if (ratio == null) return "N/A";
  if (ratio < 0.5) return "⬆️ Bullish";
  if (ratio > 2.0) return "⬇️ Bearish";
  if (ratio < 0.75) return "↗ Leaning Bull";
  if (ratio > 1.5) return "↘ Leaning Bear";
  return "⚖ Neutral";
}

// ── P/C Gauge ─────────────────────────────────────────────────────────────

function PCGauge({ ratio }: { ratio: number | null }) {
  if (ratio == null) return <span className="text-[#8b8b91] text-xs">N/A</span>;
  // Clamp 0 – 3 → 0 – 100%
  const pct = Math.min(Math.max((ratio / 3) * 100, 0), 100);
  const color = pcRatioColor(ratio);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span style={{ color }} className="font-semibold">
          {ratio.toFixed(2)}
        </span>
        <span style={{ color }} className="text-[11px]">
          {pcRatioLabel(ratio)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-[#2a2a2d] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-[#55555c]">
        <span>0 (Calls)</span>
        <span>3 (Puts)</span>
      </div>
    </div>
  );
}

// ── OI Bar ────────────────────────────────────────────────────────────────

function OIBar({ callOI, putOI }: { callOI: number; putOI: number }) {
  const total = callOI + putOI;
  if (total === 0) return <span className="text-[#8b8b91] text-xs">No OI data</span>;
  const callPct = (callOI / total) * 100;
  const putPct = (putOI / total) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-[#26a86a]">📞 Calls {fmtNum(callOI)} OI</span>
        <span className="text-[#e05454]">Put {fmtNum(putOI)} OI 📉</span>
      </div>
      <div className="w-full h-2 flex rounded-full overflow-hidden">
        <div style={{ width: `${callPct}%`, background: "#26a86a" }} />
        <div style={{ width: `${putPct}%`, background: "#e05454" }} />
      </div>
      <div className="text-[10px] text-[#55555c]">
        {callPct.toFixed(0)}% calls / {putPct.toFixed(0)}% puts
      </div>
    </div>
  );
}

// ── Stock Card ─────────────────────────────────────────────────────────────

function StockCard({
  stock,
  expanded,
  onToggle,
}: {
  stock: StockFlow;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (stock.error) {
    return (
      <div className="bg-[#1c1c1e] border border-[#2a2a2d] rounded-xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-[#e8e8ea] font-semibold text-sm">{stock.ticker}</span>
          <span className="text-[#e05454] text-xs">Error: {stock.error}</span>
        </div>
      </div>
    );
  }

  const { summary, unusualActivity, unusualFlags, unusualContracts, highestIVStrike } = stock;

  return (
    <div
      className={`bg-[#1c1c1e] border rounded-xl overflow-hidden transition-all ${
        unusualActivity ? "border-[#e05454]/60" : "border-[#2a2a2d]"
      }`}
    >
      {/* Card Header */}
      <div
        className="p-4 cursor-pointer hover:bg-[rgba(255,255,255,0.02)] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <span className="text-[#e8e8ea] font-bold text-base">{stock.ticker}</span>
            {unusualActivity && (
              <span className="text-xs bg-[#e05454]/20 text-[#e05454] border border-[#e05454]/40 px-2 py-0.5 rounded-full font-medium">
                🚨 Unusual
              </span>
            )}
            <span className="text-[#55555c] text-xs ml-auto">
              {unusualContracts?.length || 0} flagged contracts
            </span>
          </div>
          <span className="text-[#55555c] text-xs mt-0.5">{expanded ? "▲" : "▼"}</span>
        </div>

        {/* Metrics row */}
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-[#55555c] uppercase tracking-wide mb-1">
              Put/Call Ratio
            </div>
            <PCGauge ratio={summary?.putCallRatio ?? null} />
          </div>
          <div>
            <div className="text-[10px] text-[#55555c] uppercase tracking-wide mb-1">
              Open Interest
            </div>
            <OIBar callOI={summary?.totalCallOI ?? 0} putOI={summary?.totalPutOI ?? 0} />
          </div>
        </div>

        {/* Volume row */}
        <div className="mt-2 flex gap-4 text-xs">
          <span className="text-[#26a86a]">
            📞 Vol: {fmtNum(summary?.totalCallVolume)}
          </span>
          <span className="text-[#e05454]">
            📉 Vol: {fmtNum(summary?.totalPutVolume)}
          </span>
          {highestIVStrike && (
            <span className="text-[#f5c842]">
              ⚡ Peak IV: {highestIVStrike.iv}% @ ${highestIVStrike.strike}{" "}
              {highestIVStrike.type.toUpperCase()} {highestIVStrike.expiry}
            </span>
          )}
        </div>

        {/* Flags */}
        {unusualFlags && unusualFlags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unusualFlags.map((f, i) => (
              <span
                key={i}
                className="text-[10px] bg-[#f5c842]/10 text-[#f5c842] border border-[#f5c842]/30 px-2 py-0.5 rounded-full"
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Expanded: Unusual Strikes Table */}
      {expanded && unusualContracts && unusualContracts.length > 0 && (
        <div className="border-t border-[#2a2a2d] px-4 pb-4">
          <div className="text-[10px] text-[#55555c] uppercase tracking-wide mt-3 mb-2">
            Unusual Contracts (volume &gt; 2× avg OI)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#55555c] border-b border-[#2a2a2d]">
                  <th className="text-left pb-1.5 pr-3">Type</th>
                  <th className="text-right pb-1.5 pr-3">Strike</th>
                  <th className="text-left pb-1.5 pr-3">Expiry</th>
                  <th className="text-right pb-1.5 pr-3">Volume</th>
                  <th className="text-right pb-1.5 pr-3">OI</th>
                  <th className="text-right pb-1.5 pr-3">IV%</th>
                  <th className="text-right pb-1.5">Vol/OI</th>
                </tr>
              </thead>
              <tbody>
                {unusualContracts.map((c, i) => (
                  <tr
                    key={i}
                    className={`border-b border-[#1e1e20] ${
                      i % 2 === 0 ? "bg-[rgba(255,255,255,0.01)]" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-3">
                      <span
                        className={`font-semibold ${
                          c.type === "call" ? "text-[#26a86a]" : "text-[#e05454]"
                        }`}
                      >
                        {c.type === "call" ? "📞 CALL" : "📉 PUT"}
                      </span>
                      {c.inTheMoney && (
                        <span className="ml-1 text-[9px] text-[#f5c842]">ITM</span>
                      )}
                    </td>
                    <td className="text-right pr-3 text-[#e8e8ea]">${c.strike}</td>
                    <td className="pr-3 text-[#8b8b91]">{c.expiry}</td>
                    <td className="text-right pr-3 text-[#e8e8ea] font-medium">
                      {fmtNum(c.volume)}
                    </td>
                    <td className="text-right pr-3 text-[#8b8b91]">
                      {fmtNum(c.openInterest)}
                    </td>
                    <td className="text-right pr-3">
                      {c.iv != null ? (
                        <span
                          className={`font-medium ${
                            c.iv > 100 ? "text-[#e05454]" : c.iv > 60 ? "text-[#f5c842]" : "text-[#8b8b91]"
                          }`}
                        >
                          {c.iv}%
                        </span>
                      ) : (
                        <span className="text-[#55555c]">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span
                        className={`font-semibold ${
                          c.volOiRatio > 10
                            ? "text-[#e05454]"
                            : c.volOiRatio > 5
                            ? "text-[#f5c842]"
                            : "text-[#8b8b91]"
                        }`}
                      >
                        {c.volOiRatio === Infinity || c.openInterest === 0
                          ? "NEW"
                          : c.volOiRatio.toFixed(1) + "×"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {expanded && (!unusualContracts || unusualContracts.length === 0) && (
        <div className="border-t border-[#2a2a2d] px-4 py-3 text-[#55555c] text-xs">
          No unusual contract activity detected for this expiration cycle.
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function OptionsFlowPage() {
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/options-flow");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
      // Auto-expand unusual tickers
      const unusual = (d.stocks || [])
        .filter((s: StockFlow) => s.unusualActivity)
        .map((s: StockFlow) => s.ticker);
      setExpandedTickers(new Set(unusual));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/options-flow", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setData(d);
      const unusual = (d.stocks || [])
        .filter((s: StockFlow) => s.unusualActivity)
        .map((s: StockFlow) => s.ticker);
      setExpandedTickers(new Set(unusual));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const toggleTicker = (ticker: string) => {
    setExpandedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const unusualCount = data?.stocks?.filter((s) => s.unusualActivity).length ?? 0;

  return (
    <div className="min-h-screen bg-[#111112] text-[#e8e8ea]">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#e8e8ea]">🌊 Options Flow</h1>
              <p className="text-[#8b8b91] text-sm mt-1">
                Smart money signals from public options data — Graham&apos;s watchlist
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-[#5e6ad2] hover:bg-[#6e7ae2] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
            >
              {refreshing ? (
                <>
                  <span className="animate-spin">⟳</span> Refreshing...
                </>
              ) : (
                "🔄 Refresh"
              )}
            </button>
          </div>

          {/* Stats bar */}
          {data && (
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <div className="bg-[#1c1c1e] border border-[#2a2a2d] rounded-lg px-4 py-2">
                <span className="text-[#55555c] text-xs">Stocks</span>
                <div className="font-semibold">{data.stocks?.length ?? 0}</div>
              </div>
              <div className="bg-[#1c1c1e] border border-[#e05454]/40 rounded-lg px-4 py-2">
                <span className="text-[#55555c] text-xs">🚨 Unusual</span>
                <div className="font-semibold text-[#e05454]">{unusualCount}</div>
              </div>
              <div className="bg-[#1c1c1e] border border-[#2a2a2d] rounded-lg px-4 py-2">
                <span className="text-[#55555c] text-xs">Last Scan</span>
                <div className="font-semibold text-xs">
                  {new Date(data.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="mt-3 flex items-start gap-2 bg-[#1c1c1e] border border-[#2a2a2d] rounded-lg px-4 py-2.5 text-xs text-[#8b8b91]">
            <span className="text-[#f5c842] mt-0.5">⚠️</span>
            <span>
              Based on public options data via Yahoo Finance. <strong className="text-[#e8e8ea]">Not dark pool.</strong>{" "}
              True dark pool feeds require paid APIs (Unusual Whales, Finviz Elite, etc.).
              Unusual activity = volume &gt; 2× average open interest.
            </span>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-[#55555c]">
            <span className="animate-spin mr-2">⟳</span> Loading options flow data...
          </div>
        ) : error ? (
          <div className="bg-[#1c1c1e] border border-[#e05454]/50 rounded-xl p-6 text-center">
            <div className="text-[#e05454] font-medium mb-2">⚠️ Error loading data</div>
            <div className="text-[#8b8b91] text-sm">{error}</div>
            <button
              onClick={fetchData}
              className="mt-3 px-4 py-2 bg-[#2a2a2d] hover:bg-[#333336] rounded-lg text-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {(data?.stocks ?? []).map((stock) => (
              <StockCard
                key={stock.ticker}
                stock={stock}
                expanded={expandedTickers.has(stock.ticker)}
                onToggle={() => toggleTicker(stock.ticker)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

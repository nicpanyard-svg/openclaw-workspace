"use client";

import { useState, useEffect, useCallback } from "react";

interface BacktestResult {
  ticker: string;
  company: string;
  stage: string;
  starterBuyPrice: number;
  actualEntryPrice: number;
  currentPrice: number;
  return_pct: number;
  win: boolean;
  maxDrawdown: number;
  backtest_date: string;
}

interface BacktestData {
  generated?: string;
  totalTested: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturn: number;
  results: BacktestResult[];
}

export default function BacktestPage() {
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadResults = useCallback(async () => {
    try {
      const res = await fetch("/api/backtest");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load backtest results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const runBacktest = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setError(json.error + (json.detail ? `: ${json.detail}` : ""));
      } else {
        setData(json);
      }
    } catch {
      setError("Backtest request failed.");
    } finally {
      setRunning(false);
    }
  };

  const formatReturn = (pct: number) => {
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(2)}%`;
  };

  const returnColor = (pct: number) =>
    pct >= 0 ? "text-[#26a86a]" : "text-[#e54d2e]";

  const stageColor: Record<string, string> = {
    "Starter Buy": "bg-[#1a3a2a] text-[#26a86a]",
    "Watch / Setup": "bg-[#1a2a3a] text-[#6eb3f7]",
    "Pipeline": "bg-[#2a2a1a] text-[#f5c518]",
    "Add on Proof": "bg-[#2a1a3a] text-[#b78cf7]",
    "Trim / Exit": "bg-[#3a1a1a] text-[#e54d2e]",
  };

  return (
    <div className="p-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-[#e8e8ea] tracking-tight">
            📊 Backtesting Engine
          </h1>
          <p className="text-[13px] text-[#8b8b91] mt-1">
            Graham buy zones tested against 2 years of Yahoo Finance price data
          </p>
        </div>
        <button
          onClick={runBacktest}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-[6px] bg-[#5e6ad2] text-white text-[13px] font-semibold hover:bg-[#6b78e5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running…
            </>
          ) : (
            <>▶ Run Backtest</>
          )}
        </button>
      </div>

      {/* Summary Tiles */}
      {data && data.totalTested > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryTile
            label="Stocks Tested"
            value={String(data.totalTested)}
            sub="from Graham board"
          />
          <SummaryTile
            label="Win Rate"
            value={`${data.winRate}%`}
            sub={`${data.wins}W / ${data.losses}L`}
            valueClass={data.winRate >= 50 ? "text-[#26a86a]" : "text-[#e54d2e]"}
          />
          <SummaryTile
            label="Avg Return"
            value={formatReturn(data.avgReturn)}
            sub="from buy zone entry"
            valueClass={returnColor(data.avgReturn)}
          />
          <SummaryTile
            label="Last Run"
            value={
              data.generated
                ? new Date(data.generated).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"
            }
            sub={
              data.generated
                ? new Date(data.generated).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Never run"
            }
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-[6px] bg-[#3a1a1a] border border-[#5a2a2a] text-[#e54d2e] text-[13px]">
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-[13px] text-[#8b8b91]">Loading results…</div>
      )}

      {/* Results Table */}
      {!loading && data && data.results && data.results.length > 0 && (
        <div className="rounded-[8px] border border-[#2a2a2d] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[#161618] border-b border-[#2a2a2d]">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Ticker
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Stage
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Buy Zone
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Entry Price
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Current
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Return
                </th>
                <th className="text-center px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Result
                </th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-[#55555c] uppercase tracking-wider">
                  Max Drawdown
                </th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r, i) => (
                <tr
                  key={r.ticker}
                  className={`border-b border-[#1e1e21] ${
                    i % 2 === 0 ? "bg-[#0f0f10]" : "bg-[#121214]"
                  } hover:bg-[rgba(255,255,255,0.03)] transition-colors`}
                >
                  {/* Ticker */}
                  <td className="px-4 py-3">
                    <div className="font-semibold text-[#e8e8ea]">{r.ticker}</div>
                    <div className="text-[11px] text-[#55555c] mt-0.5">{r.company}</div>
                  </td>
                  {/* Stage */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-[4px] text-[11px] font-medium ${
                        stageColor[r.stage] || "bg-[#2a2a2d] text-[#8b8b91]"
                      }`}
                    >
                      {r.stage}
                    </span>
                  </td>
                  {/* Buy Zone */}
                  <td className="px-4 py-3 text-right text-[#8b8b91]">
                    ${r.starterBuyPrice.toLocaleString()}
                  </td>
                  {/* Entry */}
                  <td className="px-4 py-3 text-right text-[#e8e8ea]">
                    ${r.actualEntryPrice.toLocaleString()}
                  </td>
                  {/* Current */}
                  <td className="px-4 py-3 text-right text-[#e8e8ea] font-medium">
                    ${r.currentPrice.toLocaleString()}
                  </td>
                  {/* Return */}
                  <td className={`px-4 py-3 text-right font-semibold ${returnColor(r.return_pct)}`}>
                    {formatReturn(r.return_pct)}
                  </td>
                  {/* Win/Loss badge */}
                  <td className="px-4 py-3 text-center">
                    {r.win ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1a3a2a] text-[#26a86a] text-[11px] font-semibold">
                        ✓ WIN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3a1a1a] text-[#e54d2e] text-[11px] font-semibold">
                        ✗ LOSS
                      </span>
                    )}
                  </td>
                  {/* Max Drawdown */}
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        r.maxDrawdown > 50
                          ? "text-[#e54d2e]"
                          : r.maxDrawdown > 25
                          ? "text-[#f5c518]"
                          : "text-[#8b8b91]"
                      }
                    >
                      -{r.maxDrawdown.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data || !data.results || data.results.length === 0) && (
        <div className="text-center py-16 text-[#55555c]">
          <div className="text-[40px] mb-3">📊</div>
          <div className="text-[14px] font-medium text-[#8b8b91]">No backtest results yet</div>
          <div className="text-[13px] mt-1">
            Click{" "}
            <button onClick={runBacktest} className="text-[#5e6ad2] hover:underline">
              Run Backtest
            </button>{" "}
            to test Graham's buy zones against historical data
          </div>
        </div>
      )}

      {/* Footnote */}
      {data && data.results && data.results.length > 0 && (
        <p className="mt-4 text-[11px] text-[#3a3a3d]">
          * Entry price is the first historical close at or below the starter buy zone (±2% threshold). If the zone was never reached, the 2-year low is used as theoretical entry. Not financial advice.
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  valueClass = "text-[#e8e8ea]",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[8px] bg-[#161618] border border-[#2a2a2d] px-4 py-3">
      <div className="text-[11px] text-[#55555c] uppercase tracking-wider font-medium mb-1">
        {label}
      </div>
      <div className={`text-[22px] font-semibold tracking-tight ${valueClass}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#55555c] mt-0.5">{sub}</div>}
    </div>
  );
}

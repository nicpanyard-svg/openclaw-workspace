"use client";

import { useState, useEffect, useCallback } from "react";

interface PositionResult {
  ticker: string;
  company: string;
  stage?: string;
  theme?: string;
  currentPrice?: number;
  stopLossPrice?: number;
  stopLossSource?: string;
  stopLossPct?: number;
  maxPositionDollars?: number;
  maxPositionShares?: number;
  riskAdjustedShares?: number;
  recommendedShares?: number;
  costBasis?: number;
  maxLossDollars?: number;
  allocationPct?: number;
  riskStatus?: "green" | "yellow" | "red";
  error?: string;
}

interface SizingData {
  generated: string | null;
  config: {
    portfolioSize: number;
    maxPositionPct: number;
    maxRiskPerTradePct: number;
    defaultStopLossPct: number;
  };
  results: PositionResult[];
}

const STATUS_COLORS = {
  green: {
    row: "bg-[rgba(38,168,106,0.06)] border-[rgba(38,168,106,0.15)]",
    badge: "bg-[rgba(38,168,106,0.15)] text-[#26a86a]",
    dot: "bg-[#26a86a]",
    label: "Within limits",
  },
  yellow: {
    row: "bg-[rgba(245,187,67,0.06)] border-[rgba(245,187,67,0.15)]",
    badge: "bg-[rgba(245,187,67,0.15)] text-[#f5bb43]",
    dot: "bg-[#f5bb43]",
    label: "Borderline",
  },
  red: {
    row: "bg-[rgba(229,72,77,0.06)] border-[rgba(229,72,77,0.15)]",
    badge: "bg-[rgba(229,72,77,0.15)] text-[#e5484d]",
    dot: "bg-[#e5484d]",
    label: "Oversized",
  },
};

function fmt$(n?: number) {
  if (n === undefined || n === null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n?: number) {
  if (n === undefined || n === null) return "—";
  return n.toFixed(1) + "%";
}

function fmtShares(n?: number) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString();
}

export default function PositionSizingPage() {
  const [data, setData] = useState<SizingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Config inputs
  const [portfolioSize, setPortfolioSize] = useState(50000);
  const [maxPositionPct, setMaxPositionPct] = useState(5);
  const [maxRiskPerTradePct, setMaxRiskPerTradePct] = useState(1);
  const [defaultStopLossPct, setDefaultStopLossPct] = useState(8);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/position-sizing");
      const json: SizingData = await res.json();
      setData(json);
      if (json.config) {
        setPortfolioSize(json.config.portfolioSize);
        setMaxPositionPct(json.config.maxPositionPct);
        setMaxRiskPerTradePct(json.config.maxRiskPerTradePct);
        setDefaultStopLossPct(json.config.defaultStopLossPct);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const res = await fetch("/api/position-sizing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioSize, maxPositionPct, maxRiskPerTradePct, defaultStopLossPct }),
      });
      const json: SizingData = await res.json();
      if ("error" in json) throw new Error((json as { error: string }).error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  const totalDeployed = data?.results.reduce((s, r) => s + (r.costBasis ?? 0), 0) ?? 0;
  const totalRisk = data?.results.reduce((s, r) => s + (r.maxLossDollars ?? 0), 0) ?? 0;
  const greenCount = data?.results.filter((r) => r.riskStatus === "green").length ?? 0;
  const yellowCount = data?.results.filter((r) => r.riskStatus === "yellow").length ?? 0;
  const redCount = data?.results.filter((r) => r.riskStatus === "red").length ?? 0;

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold text-[#e8e8ea] flex items-center gap-2">
          📐 Position Sizing
        </h1>
        <p className="text-[13px] text-[#55555c] mt-1">
          Calculate exact shares to buy based on portfolio size and risk tolerance.
        </p>
      </div>

      {/* Config Panel */}
      <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-5 mb-6">
        <h2 className="text-[13px] font-semibold text-[#8b8b91] uppercase tracking-wider mb-4">
          Configuration
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-[11px] text-[#55555c] mb-1.5 uppercase tracking-wide">
              Portfolio Size
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#55555c] text-[13px]">$</span>
              <input
                type="number"
                value={portfolioSize}
                onChange={(e) => setPortfolioSize(Number(e.target.value))}
                className="w-full bg-[#1e1e20] border border-[#2a2a2d] rounded-[5px] px-3 pl-6 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#55555c] mb-1.5 uppercase tracking-wide">
              Max Position %
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.5"
                min="1"
                max="100"
                value={maxPositionPct}
                onChange={(e) => setMaxPositionPct(Number(e.target.value))}
                className="w-full bg-[#1e1e20] border border-[#2a2a2d] rounded-[5px] px-3 pr-8 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55555c] text-[13px]">%</span>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#55555c] mb-1.5 uppercase tracking-wide">
              Max Risk / Trade
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="10"
                value={maxRiskPerTradePct}
                onChange={(e) => setMaxRiskPerTradePct(Number(e.target.value))}
                className="w-full bg-[#1e1e20] border border-[#2a2a2d] rounded-[5px] px-3 pr-8 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55555c] text-[13px]">%</span>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-[#55555c] mb-1.5 uppercase tracking-wide">
              Default Stop Loss
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                max="50"
                value={defaultStopLossPct}
                onChange={(e) => setDefaultStopLossPct(Number(e.target.value))}
                className="w-full bg-[#1e1e20] border border-[#2a2a2d] rounded-[5px] px-3 pr-8 py-2 text-[13px] text-[#e8e8ea] focus:outline-none focus:border-[#5e6ad2]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55555c] text-[13px]">%</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={recalculate}
            disabled={calculating}
            className="flex items-center gap-2 px-4 py-2 bg-[#5e6ad2] hover:bg-[#4e5bc2] disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-[5px] transition-colors"
          >
            {calculating ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Calculating…
              </>
            ) : (
              "📐 Recalculate"
            )}
          </button>
          {data?.generated && (
            <span className="text-[11px] text-[#55555c]">
              Last run: {new Date(data.generated).toLocaleString()}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 bg-[rgba(229,72,77,0.1)] border border-[rgba(229,72,77,0.2)] rounded text-[12px] text-[#e5484d]">
            {error}
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {data && data.results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-4">
            <div className="text-[11px] text-[#55555c] uppercase tracking-wide mb-1">Portfolio Size</div>
            <div className="text-[18px] font-semibold text-[#e8e8ea]">
              ${data.config.portfolioSize.toLocaleString()}
            </div>
          </div>
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-4">
            <div className="text-[11px] text-[#55555c] uppercase tracking-wide mb-1">Total Deployed</div>
            <div className="text-[18px] font-semibold text-[#e8e8ea]">
              ${totalDeployed.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-[#55555c] mt-0.5">
              {((totalDeployed / data.config.portfolioSize) * 100).toFixed(1)}% of portfolio
            </div>
          </div>
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-4">
            <div className="text-[11px] text-[#55555c] uppercase tracking-wide mb-1">Total Max Loss</div>
            <div className="text-[18px] font-semibold text-[#e5484d]">
              ${totalRisk.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-[#55555c] mt-0.5">
              {((totalRisk / data.config.portfolioSize) * 100).toFixed(1)}% of portfolio
            </div>
          </div>
          <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-4">
            <div className="text-[11px] text-[#55555c] uppercase tracking-wide mb-1">Risk Status</div>
            <div className="flex items-center gap-2 mt-1">
              {greenCount > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-[#26a86a]">
                  <span className="w-2 h-2 rounded-full bg-[#26a86a]" /> {greenCount}
                </span>
              )}
              {yellowCount > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-[#f5bb43]">
                  <span className="w-2 h-2 rounded-full bg-[#f5bb43]" /> {yellowCount}
                </span>
              )}
              {redCount > 0 && (
                <span className="flex items-center gap-1 text-[12px] text-[#e5484d]">
                  <span className="w-2 h-2 rounded-full bg-[#e5484d]" /> {redCount}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-8 text-center text-[#55555c] text-[13px]">
          Loading position data…
        </div>
      ) : !data || data.results.length === 0 ? (
        <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg p-8 text-center">
          <div className="text-[32px] mb-2">📐</div>
          <div className="text-[14px] text-[#8b8b91]">No position data yet</div>
          <div className="text-[12px] text-[#55555c] mt-1">Click Recalculate to generate sizing</div>
        </div>
      ) : (
        <div className="bg-[#161618] border border-[#2a2a2d] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#2a2a2d]">
                  <th className="px-4 py-3 text-left text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Ticker
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Price
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Stop Loss
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Risk
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Shares
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Cost Basis
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Max Loss $
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] text-[#55555c] uppercase tracking-wider font-medium">
                    Alloc %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e20]">
                {data.results.map((row) => {
                  if (row.error) {
                    return (
                      <tr key={row.ticker} className="opacity-50">
                        <td className="px-4 py-3">
                          <span className="w-2 h-2 inline-block rounded-full bg-[#3a3a3d]" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-[#e8e8ea]">{row.ticker}</span>
                          <span className="ml-2 text-[11px] text-[#55555c]">{row.company}</span>
                        </td>
                        <td colSpan={7} className="px-4 py-3 text-[#55555c] text-center">
                          {row.error}
                        </td>
                      </tr>
                    );
                  }

                  const status = row.riskStatus ?? "green";
                  const colors = STATUS_COLORS[status];

                  return (
                    <tr key={row.ticker} className={`${colors.row} border-l-2 transition-colors hover:brightness-110`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.badge}`}>
                            {colors.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono font-semibold text-[#e8e8ea]">{row.ticker}</span>
                          <span className="text-[11px] text-[#55555c]">{row.company}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#e8e8ea]">
                        {fmt$(row.currentPrice)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-[#e8e8ea]">{fmt$(row.stopLossPrice)}</span>
                          <span className="text-[10px] text-[#55555c]">
                            {row.stopLossSource === "alerts" ? "📌 set" : `${fmtPct(row.stopLossPct)} below`}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#8b8b91]">
                        {fmtPct(row.stopLossPct)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-[#e8e8ea]">{fmtShares(row.recommendedShares)}</span>
                        {row.riskAdjustedShares !== undefined && row.maxPositionShares !== undefined && (
                          <div className="text-[10px] text-[#55555c]">
                            risk: {row.riskAdjustedShares} | max: {row.maxPositionShares}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#e8e8ea]">
                        {fmt$(row.costBasis)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#e5484d]">
                        {fmt$(row.maxLossDollars)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-[#e8e8ea]">{fmtPct(row.allocationPct)}</span>
                          <div className="w-16 h-1 bg-[#2a2a2d] rounded mt-1">
                            <div
                              className={`h-1 rounded ${colors.dot}`}
                              style={{
                                width: `${Math.min(100, ((row.allocationPct ?? 0) / (data?.config.maxPositionPct ?? 5)) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 text-[11px] text-[#55555c]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#26a86a]" />
          <span>Within risk limits</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#f5bb43]" />
          <span>Borderline (&gt;90% of limit)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#e5484d]" />
          <span>Oversized (&gt;110% of limit)</span>
        </div>
        <div className="ml-auto">
          📌 = stop from alerts.json &nbsp;|&nbsp; default = {data?.config.defaultStopLossPct ?? 8}% below entry
        </div>
      </div>
    </div>
  );
}

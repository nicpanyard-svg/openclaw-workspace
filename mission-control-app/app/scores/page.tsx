"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dimensions {
  revenueGrowth: number;
  earningsQuality: number;
  analystSentiment: number;
  technicalMomentum: number;
  valuation: number;
  balanceSheet: number;
  insiderActivity: number;
  catalystPipeline: number;
}

interface StockScore {
  ticker: string;
  company: string;
  stage: string;
  theme: string;
  totalScore: number;
  maxScore: number;
  dimensions: Dimensions;
  rawData: {
    price: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    forwardPE: number | null;
    revenueGrowth: number | null;
    totalCash: number | null;
    totalDebt: number | null;
    freeCashflow: number | null;
    currentRatio: number | null;
    rsi14: number | null;
    nextEarningsDate: string | null;
    analystTarget: number | null;
    recommendationMean: number | null;
  };
  error: string | null;
  timestamp: string;
}

interface ThesisChange {
  ticker: string;
  company: string;
  prevScore: number;
  newScore: number;
  delta: number;
  direction: "improved" | "deteriorated";
}

interface LastRun {
  runAt: string;
  stocksScored: number;
  thesisChanges: number;
  changes: ThesisChange[];
}

interface ScoresData {
  scores: StockScore[];
  totalStocks: number;
  generated: string | null;
  lastRun: LastRun | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DIM_LABELS: Record<keyof Dimensions, string> = {
  revenueGrowth: "Revenue Growth",
  earningsQuality: "Earnings Quality",
  analystSentiment: "Analyst Sentiment",
  technicalMomentum: "Technical Momentum",
  valuation: "Valuation",
  balanceSheet: "Balance Sheet",
  insiderActivity: "Insider Activity",
  catalystPipeline: "Catalyst Pipeline",
};

const DIM_ICONS: Record<keyof Dimensions, string> = {
  revenueGrowth: "📈",
  earningsQuality: "💰",
  analystSentiment: "🎯",
  technicalMomentum: "⚡",
  valuation: "🏷️",
  balanceSheet: "🏦",
  insiderActivity: "👥",
  catalystPipeline: "🚀",
};

function scoreColor(score: number, max = 8): string {
  const pct = score / max;
  if (pct >= 0.75) return "#26a86a";
  if (pct >= 0.5) return "#d4a017";
  return "#e05252";
}

function totalScoreColor(score: number): string {
  const pct = score / 64;
  if (pct >= 0.75) return "#26a86a";
  if (pct >= 0.625) return "#5eb3f5";
  if (pct >= 0.5) return "#d4a017";
  return "#e05252";
}

function fmt2(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtB(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function stageColor(stage: string): string {
  const s: Record<string, string> = {
    "Starter Buy": "#1a3a2a",
    "Watch / Setup": "#1a2a3a",
    Pipeline: "#2a2a1a",
    "Add on Proof": "#2a1a3a",
    "Trim / Exit": "#3a1a1a",
  };
  return s[stage] ?? "#2a2a2d";
}

function stageFg(stage: string): string {
  const s: Record<string, string> = {
    "Starter Buy": "#26a86a",
    "Watch / Setup": "#6eb3f7",
    Pipeline: "#f5c518",
    "Add on Proof": "#b78cf7",
    "Trim / Exit": "#e05252",
  };
  return s[stage] ?? "#8b8b91";
}

// ── Components ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 8, thesisFlag = false }: { value: number; max?: number; thesisFlag?: boolean }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const color = thesisFlag ? "#f5900a" : scoreColor(value, max);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 rounded-full overflow-hidden flex-1"
        style={{ background: "#2a2a2d" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
      <span
        className="text-[12px] font-semibold w-4 text-right"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function StockCard({
  stock,
  thesisChange,
}: {
  stock: StockScore;
  thesisChange?: ThesisChange;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = thesisChange ? "#f5900a" : "#2a2a2d";
  const pct = (stock.totalScore / 64) * 100;
  const tColor = totalScoreColor(stock.totalScore);

  return (
    <div
      className="rounded-lg border bg-[#161618] overflow-hidden transition-all"
      style={{ borderColor }}
    >
      {/* Header */}
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setExpanded((x) => !x)}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-bold text-[var(--text-primary)]">
                {stock.ticker}
              </span>
              {thesisChange && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{ background: "#f5900a22", color: "#f5900a" }}
                >
                  ⚠️ THESIS CHANGE{" "}
                  {thesisChange.delta > 0 ? "+" : ""}
                  {thesisChange.delta}
                </span>
              )}
              {stock.error && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{ background: "#e0525222", color: "#e05252" }}
                >
                  DATA ERROR
                </span>
              )}
            </div>
            <div className="text-[12px] text-[var(--text-muted)] mt-0.5">
              {stock.company}
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-[26px] font-bold leading-none"
              style={{ color: tColor }}
            >
              {stock.totalScore}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">/ 64</div>
          </div>
        </div>

        {/* Stage + theme */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded"
            style={{
              background: stageColor(stock.stage),
              color: stageFg(stock.stage),
            }}
          >
            {stock.stage}
          </span>
          {stock.theme && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {stock.theme}
            </span>
          )}
        </div>

        {/* Total score bar */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-2 rounded-full flex-1 overflow-hidden"
            style={{ background: "#2a2a2d" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: tColor,
              }}
            />
          </div>
          <span
            className="text-[11px] text-[var(--text-muted)] shrink-0"
            style={{ width: 36 }}
          >
            {pct.toFixed(0)}%
          </span>
        </div>

        {/* 8 dimension mini bars */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {(Object.keys(DIM_LABELS) as Array<keyof Dimensions>).map((key) => (
            <div key={key}>
              <div className="flex items-center gap-1 mb-0.5">
                <span className="text-[10px]">{DIM_ICONS[key]}</span>
                <span className="text-[10px] text-[var(--text-muted)] truncate flex-1">
                  {DIM_LABELS[key]}
                </span>
              </div>
              <ScoreBar
                value={stock.dimensions[key]}
                thesisFlag={!!thesisChange}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-[var(--text-muted)]">
            {stock.rawData.nextEarningsDate
              ? `Next earnings: ${stock.rawData.nextEarningsDate}`
              : ""}
          </span>
          <span className="text-[11px] text-[var(--text-muted)]">
            {expanded ? "▲ less" : "▼ details"}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="border-t px-4 pb-4 pt-3"
          style={{ borderColor: "#2a2a2d" }}
        >
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <Detail label="Price" value={stock.rawData.price != null ? `$${fmt2(stock.rawData.price)}` : "—"} />
            <Detail label="52w High" value={stock.rawData.fiftyTwoWeekHigh != null ? `$${fmt2(stock.rawData.fiftyTwoWeekHigh)}` : "—"} />
            <Detail label="52w Low" value={stock.rawData.fiftyTwoWeekLow != null ? `$${fmt2(stock.rawData.fiftyTwoWeekLow)}` : "—"} />
            <Detail label="Fwd P/E" value={fmt2(stock.rawData.forwardPE)} />
            <Detail label="Rev Growth" value={stock.rawData.revenueGrowth != null ? `${(stock.rawData.revenueGrowth * 100).toFixed(1)}%` : "—"} />
            <Detail label="RSI(14)" value={fmt2(stock.rawData.rsi14)} />
            <Detail label="Cash" value={fmtB(stock.rawData.totalCash)} />
            <Detail label="Debt" value={fmtB(stock.rawData.totalDebt)} />
            <Detail label="FCF" value={fmtB(stock.rawData.freeCashflow)} />
            <Detail label="Analyst Target" value={stock.rawData.analystTarget != null ? `$${fmt2(stock.rawData.analystTarget)}` : "—"} />
            <Detail label="Rec. Mean" value={fmt2(stock.rawData.recommendationMean)} />
            <Detail label="Current Ratio" value={fmt2(stock.rawData.currentRatio)} />
          </div>
          {stock.error && (
            <div
              className="mt-3 text-[11px] px-3 py-2 rounded"
              style={{ background: "#e0525212", color: "#e05252" }}
            >
              Data error: {stock.error}
            </div>
          )}
          <div className="text-[10px] text-[var(--text-muted)] mt-3">
            Last scored: {new Date(stock.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-[13px] font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScoresPage() {
  const [data, setData] = useState<ScoresData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "thesis">("all");

  const loadScores = useCallback(async () => {
    try {
      const res = await fetch("/api/rescore");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load scores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const runRescore = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/rescore", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setError(json.error + (json.detail ? `: ${json.detail}` : ""));
      } else {
        setData(json);
      }
    } catch {
      setError("Rescore request failed.");
    } finally {
      setRunning(false);
    }
  };

  const thesisChanges = data?.lastRun?.changes ?? [];
  const thesisMap = new Map(thesisChanges.map((c) => [c.ticker, c]));

  const filteredScores = (data?.scores ?? []).filter((s) => {
    if (filter === "thesis") return thesisMap.has(s.ticker);
    return true;
  });

  const avgScore =
    data?.scores?.length
      ? data.scores.reduce((a, b) => a + b.totalScore, 0) / data.scores.length
      : 0;

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            🧠 Graham Scores
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-1">
            8-dimension scoring · auto-rescored weekly · thesis changes flagged
          </p>
        </div>
        <button
          onClick={runRescore}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-semibold transition-all"
          style={{
            background: running ? "#2a2a2d" : "#5e6ad2",
            color: running ? "#55555c" : "#fff",
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? (
            <>
              <span className="animate-spin">⟳</span> Running…
            </>
          ) : (
            "▶ Run Rescore"
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-md px-4 py-3 mb-5 text-[13px]"
          style={{ background: "#e0525218", color: "#e05252", border: "1px solid #e0525244" }}
        >
          {error}
        </div>
      )}

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <Tile
            label="Stocks Scored"
            value={String(data.totalStocks || 0)}
          />
          <Tile
            label="Avg Score"
            value={`${avgScore.toFixed(1)} / 64`}
            color={totalScoreColor(avgScore)}
          />
          <Tile
            label="Thesis Changes"
            value={String(thesisChanges.length)}
            color={thesisChanges.length > 0 ? "#f5900a" : "#26a86a"}
          />
          <Tile
            label="Last Run"
            value={
              data.lastRun
                ? new Date(data.lastRun.runAt).toLocaleDateString()
                : "Never"
            }
            sub={
              data.lastRun
                ? new Date(data.lastRun.runAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""
            }
          />
        </div>
      )}

      {/* Thesis change banner */}
      {thesisChanges.length > 0 && (
        <div
          className="rounded-lg border px-4 py-3 mb-5"
          style={{ background: "#f5900a10", borderColor: "#f5900a44" }}
        >
          <div className="text-[12px] font-semibold text-[#f5900a] mb-2">
            ⚠️ Thesis Changes Detected ({thesisChanges.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {thesisChanges.map((c) => (
              <span
                key={c.ticker}
                className="text-[11px] font-semibold px-2 py-1 rounded"
                style={{ background: "#f5900a18", color: "#f5900a" }}
              >
                {c.ticker}{" "}
                {c.prevScore} → {c.newScore}{" "}
                ({c.delta > 0 ? "+" : ""}{c.delta})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 bg-[#161618] border border-[#2a2a2d] rounded-[8px] p-1 w-fit">
        {(
          [
            ["all", `All Stocks (${data?.scores?.length ?? 0})`],
            [
              "thesis",
              `⚠️ Thesis Changes (${thesisChanges.length})`,
            ],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className="px-4 py-2 rounded-[6px] text-[13px] font-semibold transition-all"
            style={{
              background: filter === tab ? "#2a2a2d" : "transparent",
              color: filter === tab ? "#e8e8ea" : "#55555c",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Score cards */}
      {loading ? (
        <div className="text-[var(--text-muted)] text-[13px] py-8 text-center">
          Loading scores…
        </div>
      ) : filteredScores.length === 0 ? (
        <div className="text-[var(--text-muted)] text-[13px] py-8 text-center">
          {filter === "thesis" ? "No thesis changes in last run." : "No scores yet — run a rescore."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredScores.map((stock) => (
            <StockCard
              key={stock.ticker}
              stock={stock}
              thesisChange={thesisMap.get(stock.ticker)}
            />
          ))}
        </div>
      )}

      {/* Dimension legend */}
      <div
        className="mt-8 rounded-lg border border-[#2a2a2d] bg-[#161618] p-4"
      >
        <div className="text-[12px] font-semibold text-[var(--text-secondary)] mb-3">
          Scoring Dimensions (0–8 each = 64 max)
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(DIM_LABELS) as Array<keyof Dimensions>).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[14px]">{DIM_ICONS[key]}</span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {DIM_LABELS[key]}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
          <span>
            <span style={{ color: "#26a86a" }}>●</span> 6–8 Strong
          </span>
          <span>
            <span style={{ color: "#d4a017" }}>●</span> 4–5 Neutral
          </span>
          <span>
            <span style={{ color: "#e05252" }}>●</span> 0–3 Weak
          </span>
          <span>
            <span style={{ color: "#f5900a" }}>●</span> Thesis Change (delta &gt; 1.5)
          </span>
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-[#2a2a2d] bg-[#161618] p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {label}
      </div>
      <div
        className="text-[22px] font-semibold leading-tight"
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{sub}</div>
      )}
    </div>
  );
}

#!/usr/bin/env node
/**
 * Graham Auto-Rescore
 * Fetches fresh Yahoo Finance data for all stocks on the board and
 * computes 8-dimension Graham scores. Flags thesis changes (delta > 1.5 pts).
 *
 * Usage: node scripts/auto-rescore.js
 */

"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");

const WORKSPACE = path.resolve(__dirname, "..");
const BOARD_FILE = path.join(WORKSPACE, "graham-stock-board", "board.seed.json");
const SCORES_FILE = path.join(WORKSPACE, "data", "stock-scores.json");
const LOG_FILE = path.join(WORKSPACE, "data", "rescore-log.json");

// Yahoo auth — cookie stays valid for ~1 year
const YF_COOKIE =
  "A1=d=AQABBANPyGkCEI9W0BQYQiNhsPcarZTn54kFEgEBAQGgyWnSadxS0iMA_eMDAA&S=AQAAArltpvERgM0MzRpNtbXgrYA; " +
  "A3=d=AQABBANPyGkCEI9W0BQYQiNhsPcarZTn54kFEgEBAQGgyWnSadxS0iMA_eMDAA&S=AQAAArltpvERgM0MzRpNtbXgrYA; " +
  "A1S=d=AQABBANPyGkCEI9W0BQYQiNhsPcarZTn54kFEgEBAQGgyWnSadxS0iMA_eMDAA&S=AQAAArltpvERgM0MzRpNtbXgrYA";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpsGet(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let d = "";
      const setCookies = (res.headers["set-cookie"] ?? [])
        .map((c) => c.split(";")[0])
        .join("; ");
      res.on("data", (c) => (d += c));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: d, newCookies: setCookies })
      );
    });
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

// ── Yahoo Finance helpers ─────────────────────────────────────────────────────
async function getCrumb() {
  const r = await httpsGet({
    hostname: "query1.finance.yahoo.com",
    path: "/v1/test/getcrumb",
    method: "GET",
    maxHeaderSize: 32768,
    headers: { "User-Agent": UA, Cookie: YF_COOKIE, Accept: "text/plain" },
  });
  if (r.status === 200 && !r.body.includes("{")) return r.body.trim();
  throw new Error(`Crumb fetch failed (${r.status}): ${r.body.substring(0, 100)}`);
}

async function getQuoteSummary(ticker, crumb) {
  const modules = [
    "financialData",
    "defaultKeyStatistics",
    "earnings",
    "upgradeDowngradeHistory",
    "summaryDetail",
    "insiderHolders",
    "calendarEvents",
  ].join(",");
  const r = await httpsGet({
    hostname: "query1.finance.yahoo.com",
    path: `/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`,
    method: "GET",
    maxHeaderSize: 32768,
    headers: {
      "User-Agent": UA,
      Cookie: YF_COOKIE,
      Accept: "application/json",
    },
  });
  const json = JSON.parse(r.body);
  if (r.status !== 200) {
    throw new Error(
      `Yahoo returned ${r.status}: ${json?.quoteSummary?.error?.description ?? r.body.substring(0, 80)}`
    );
  }
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error("No quoteSummary result");
  return result;
}

async function getChartData(ticker) {
  const r = await httpsGet({
    hostname: "query1.finance.yahoo.com",
    path: `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`,
    method: "GET",
    maxHeaderSize: 32768,
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const json = JSON.parse(r.body);
  return json?.chart?.result?.[0] ?? null;
}

// ── Technical indicators from chart data ─────────────────────────────────────
function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const deltas = [];
  for (let i = 1; i < closes.length; i++) {
    deltas.push(closes[i] - closes[i - 1]);
  }
  const recent = deltas.slice(-period);
  const gains = recent.map((d) => (d > 0 ? d : 0));
  const losses = recent.map((d) => (d < 0 ? Math.abs(d) : 0));
  const avgG = gains.reduce((a, b) => a + b, 0) / period;
  const avgL = losses.reduce((a, b) => a + b, 0) / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

// ── Scoring dimensions ────────────────────────────────────────────────────────

/** 1. Revenue growth trajectory (0–8) */
function scoreRevenueGrowth(financialData) {
  const g = financialData?.revenueGrowth?.raw;
  if (g == null) return 4;
  if (g > 0.6) return 8;
  if (g > 0.4) return 7;
  if (g > 0.25) return 6;
  if (g > 0.1) return 5;
  if (g > 0) return 4;
  if (g > -0.05) return 3;
  if (g > -0.15) return 2;
  return 1;
}

/** 2. Earnings quality / beat rate (0–8) */
function scoreEarningsQuality(earnings) {
  const history = earnings?.earningsHistory?.history ?? [];
  if (!history.length) return 4;
  const recent = history.slice(-4);
  const beats = recent.filter((q) => {
    const a = q.epsActual?.raw;
    const e = q.epsEstimate?.raw;
    return a != null && e != null && a > e;
  }).length;
  const beatRate = beats / recent.length;
  const surprises = recent.map((q) => q.surprisePercent?.raw ?? 0);
  const avgSurprise =
    surprises.reduce((s, v) => s + v, 0) / surprises.length;

  if (beatRate >= 1.0 && avgSurprise > 10) return 8;
  if (beatRate >= 1.0) return 7;
  if (beatRate >= 0.75 && avgSurprise > 5) return 7;
  if (beatRate >= 0.75) return 6;
  if (beatRate >= 0.5 && avgSurprise > 0) return 5;
  if (beatRate >= 0.5) return 4;
  if (beatRate >= 0.25) return 3;
  return 2;
}

/** 3. Analyst sentiment — upgrades vs downgrades (0–8) */
function scoreAnalystSentiment(upgradeDowngradeHistory, summaryDetail) {
  // Primary: upgrade/downgrade history
  const history = upgradeDowngradeHistory?.history ?? [];
  const recent = history.slice(0, 30);
  let bullish = 0;
  let bearish = 0;
  for (const item of recent) {
    const action = (item.action ?? "").toLowerCase();
    const to = (item.toGrade ?? "").toLowerCase();
    const isBull =
      to.includes("buy") ||
      to.includes("outperform") ||
      to.includes("overweight") ||
      to.includes("strong buy") ||
      to.includes("positive");
    const isBear =
      to.includes("sell") ||
      to.includes("underperform") ||
      to.includes("underweight") ||
      to.includes("reduce") ||
      to.includes("negative");
    if (action === "down") bearish++;
    else if (action === "up" && isBull) bullish++;
    else if (action === "init" || action === "reit") {
      if (isBull) bullish++;
      else if (isBear) bearish++;
    }
  }
  const total = bullish + bearish;

  // Fallback: recommendationMean (1=Strong Buy … 5=Strong Sell)
  if (!total) {
    const rm = summaryDetail?.recommendationMean?.raw;
    if (rm != null) {
      if (rm < 1.5) return 8;
      if (rm < 2.0) return 7;
      if (rm < 2.5) return 6;
      if (rm < 3.0) return 5;
      if (rm < 3.5) return 4;
      if (rm < 4.0) return 3;
      return 2;
    }
    return 4;
  }

  const ratio = bullish / total;
  if (ratio >= 0.9 && bullish >= 5) return 8;
  if (ratio >= 0.8) return 7;
  if (ratio >= 0.7) return 6;
  if (ratio >= 0.6) return 5;
  if (ratio >= 0.5) return 4;
  if (ratio >= 0.4) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

/** 4. Technical momentum — 52w range position + RSI + MA trend (0–8) */
function scoreTechnicalMomentum(summaryDetail, chartData) {
  const price = summaryDetail?.regularMarketPrice?.raw ?? chartData?.meta?.regularMarketPrice;
  const high52 = summaryDetail?.fiftyTwoWeekHigh?.raw ?? chartData?.meta?.fiftyTwoWeekHigh;
  const low52 = summaryDetail?.fiftyTwoWeekLow?.raw ?? chartData?.meta?.fiftyTwoWeekLow;
  if (!price || !high52 || !low52 || high52 === low52) return 4;

  const pos52 = (price - low52) / (high52 - low52); // 0 = at low, 1 = at high

  let score;
  if (pos52 > 0.9) score = 8;
  else if (pos52 > 0.75) score = 7;
  else if (pos52 > 0.6) score = 6;
  else if (pos52 > 0.45) score = 5;
  else if (pos52 > 0.3) score = 4;
  else if (pos52 > 0.2) score = 3;
  else if (pos52 > 0.1) score = 2;
  else score = 1;

  // RSI adjustment
  if (chartData) {
    const closes = (chartData.indicators?.quote?.[0]?.close ?? []).filter(
      (x) => x != null
    );
    const rsi = computeRSI(closes);
    if (rsi != null) {
      if (rsi > 60 && rsi < 80) score = Math.min(8, score + 1); // strong momentum
      if (rsi < 30) score = Math.max(0, score - 1); // oversold = downtrend
      if (rsi > 80) score = Math.max(1, score); // overbought, cap risk
    }

    // MA trend: price above MA50 = bullish
    const last50 = closes.slice(-50).filter((x) => x != null);
    if (last50.length >= 10) {
      const ma50 = last50.reduce((a, b) => a + b, 0) / last50.length;
      if (price > ma50) score = Math.min(8, score + 0.5);
    }
  }

  return Math.round(Math.max(0, Math.min(8, score)));
}

/** 5. Valuation — forward P/E relative to growth (PEG proxy) (0–8) */
function scoreValuation(defaultKeyStatistics, financialData) {
  const fwdPE = defaultKeyStatistics?.forwardPE?.raw;
  const growth = financialData?.revenueGrowth?.raw ?? 0;

  if (fwdPE == null) return 4;
  if (fwdPE < 0) return 3; // not profitable

  const growthPct = growth * 100;
  if (growthPct <= 0) {
    if (fwdPE < 12) return 8;
    if (fwdPE < 18) return 7;
    if (fwdPE < 25) return 5;
    if (fwdPE < 40) return 3;
    return 2;
  }

  const peg = fwdPE / growthPct;
  if (peg < 0.5) return 8;
  if (peg < 1.0) return 7;
  if (peg < 1.5) return 6;
  if (peg < 2.0) return 5;
  if (peg < 3.0) return 4;
  if (peg < 5.0) return 3;
  return 2;
}

/** 6. Balance sheet strength (0–8) */
function scoreBalanceSheet(financialData) {
  const cash = financialData?.totalCash?.raw;
  const debt = financialData?.totalDebt?.raw;
  const d2e = financialData?.debtToEquity?.raw;
  const cr = financialData?.currentRatio?.raw;
  const fcf = financialData?.freeCashflow?.raw;

  let score = 4;

  if (cash != null && debt != null) {
    const netCash = cash - debt;
    if (netCash > 0) score += 2;
    else if (netCash > -cash * 0.5) score += 1;
    else if (netCash < -cash * 2) score -= 2;
    else score -= 1;
  }

  if (d2e != null) {
    if (d2e < 20) score += 1;
    else if (d2e > 200) score -= 1;
    else if (d2e > 400) score -= 2;
  }

  if (cr != null) {
    if (cr > 2.5) score += 1;
    else if (cr < 1.0) score -= 1;
  }

  if (fcf != null && fcf > 0) score += 1;

  return Math.max(0, Math.min(8, Math.round(score)));
}

/** 7. Insider & institutional activity (0–8) */
function scoreInsiderActivity(insiderHolders, chartData) {
  const holders = insiderHolders?.holders ?? [];
  const cutoff = Date.now() / 1000 - 90 * 24 * 3600; // 90 days ago
  let buys = 0;
  let sells = 0;

  for (const h of holders) {
    const txn = (h.latestTransType ?? "").toLowerCase();
    const date = h.positionDirectDate?.raw ?? 0;
    if (date < cutoff) continue;
    if (txn.includes("purchase") || txn.includes("buy") || txn.includes("exercise"))
      buys++;
    else if (txn.includes("sale") || txn.includes("sell")) sells++;
  }

  // Volume surge = institutional interest proxy
  let volBonus = 0;
  if (chartData) {
    const vols = (chartData.indicators?.quote?.[0]?.volume ?? []).filter(
      (x) => x != null && x > 0
    );
    if (vols.length >= 20) {
      const avg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20;
      const last = vols[vols.length - 1];
      if (last > avg20 * 1.5) volBonus = 1;
      else if (last < avg20 * 0.5) volBonus = -1;
    }
  }

  let score;
  if (buys === 0 && sells === 0) score = 4;
  else {
    const net = buys - sells;
    if (net >= 4) score = 8;
    else if (net >= 3) score = 7;
    else if (net >= 2) score = 6;
    else if (net === 1) score = 5;
    else if (net === 0) score = 4;
    else if (net === -1) score = 3;
    else if (net === -2) score = 2;
    else score = 1;
  }

  return Math.max(0, Math.min(8, score + volBonus));
}

/** 8. Catalyst pipeline — upcoming earnings + known catalysts (0–8) */
function scoreCatalystPipeline(calendarEvents, boardCard) {
  let score = 4;

  const earningsDates = calendarEvents?.earnings?.earningsDate ?? [];
  if (earningsDates.length) {
    const nextTs = earningsDates[0]?.raw;
    const daysUntil = nextTs
      ? (nextTs - Date.now() / 1000) / 86400
      : null;
    if (daysUntil != null) {
      if (daysUntil >= 0 && daysUntil < 14) score += 2;
      else if (daysUntil >= 0 && daysUntil < 45) score += 1;
    }
  }

  const catalysts = boardCard?.catalysts ?? [];
  if (catalysts.length >= 4) score += 2;
  else if (catalysts.length >= 2) score += 1;

  return Math.max(0, Math.min(8, score));
}

// ── Score one stock ───────────────────────────────────────────────────────────
async function scoreStock(ticker, boardCard, crumb) {
  const result = {
    ticker,
    company: boardCard?.company ?? ticker,
    stage: boardCard?.stage ?? "Unknown",
    theme: boardCard?.theme ?? "",
    timestamp: new Date().toISOString(),
    dimensions: {},
    dimensionLabels: {
      revenueGrowth: "Revenue Growth",
      earningsQuality: "Earnings Quality",
      analystSentiment: "Analyst Sentiment",
      technicalMomentum: "Technical Momentum",
      valuation: "Valuation",
      balanceSheet: "Balance Sheet",
      insiderActivity: "Insider Activity",
      catalystPipeline: "Catalyst Pipeline",
    },
    totalScore: 0,
    maxScore: 64,
    error: null,
    rawData: {},
  };

  try {
    const [q, chartData] = await Promise.all([
      getQuoteSummary(ticker, crumb),
      getChartData(ticker),
    ]);

    const {
      financialData,
      defaultKeyStatistics,
      earnings,
      upgradeDowngradeHistory,
      summaryDetail,
      insiderHolders,
      calendarEvents,
    } = q;

    result.dimensions = {
      revenueGrowth: scoreRevenueGrowth(financialData),
      earningsQuality: scoreEarningsQuality(earnings),
      analystSentiment: scoreAnalystSentiment(upgradeDowngradeHistory, summaryDetail),
      technicalMomentum: scoreTechnicalMomentum(summaryDetail, chartData),
      valuation: scoreValuation(defaultKeyStatistics, financialData),
      balanceSheet: scoreBalanceSheet(financialData),
      insiderActivity: scoreInsiderActivity(insiderHolders, chartData),
      catalystPipeline: scoreCatalystPipeline(calendarEvents, boardCard),
    };

    result.totalScore = Object.values(result.dimensions).reduce(
      (a, b) => a + b,
      0
    );

    const closes = (chartData?.indicators?.quote?.[0]?.close ?? []).filter(
      (x) => x != null
    );

    result.rawData = {
      price: summaryDetail?.regularMarketPrice?.raw ?? chartData?.meta?.regularMarketPrice ?? null,
      fiftyTwoWeekHigh: summaryDetail?.fiftyTwoWeekHigh?.raw ?? chartData?.meta?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: summaryDetail?.fiftyTwoWeekLow?.raw ?? chartData?.meta?.fiftyTwoWeekLow ?? null,
      forwardPE: defaultKeyStatistics?.forwardPE?.raw ?? null,
      revenueGrowth: financialData?.revenueGrowth?.raw ?? null,
      totalCash: financialData?.totalCash?.raw ?? null,
      totalDebt: financialData?.totalDebt?.raw ?? null,
      freeCashflow: financialData?.freeCashflow?.raw ?? null,
      currentRatio: financialData?.currentRatio?.raw ?? null,
      rsi14: closes.length >= 15 ? parseFloat((computeRSI(closes) ?? 0).toFixed(1)) : null,
      nextEarningsDate: calendarEvents?.earnings?.earningsDate?.[0]?.fmt ?? null,
      analystTarget: summaryDetail?.targetMeanPrice?.raw ?? null,
      recommendationMean: summaryDetail?.recommendationMean?.raw ?? null,
    };
  } catch (err) {
    result.error = err.message;
    // Neutral fallback scores
    result.dimensions = {
      revenueGrowth: 4,
      earningsQuality: 4,
      analystSentiment: 4,
      technicalMomentum: 4,
      valuation: 4,
      balanceSheet: 4,
      insiderActivity: 4,
      catalystPipeline: 4,
    };
    result.totalScore = 32;
    console.error(`  ✗ ${ticker}: ${err.message}`);
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const board = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8"));
  const tickers = board.cards.map((c) => c.ticker);

  console.log("=== Graham Auto-Rescore ===");
  console.log(`Stocks: ${tickers.join(", ")}`);
  console.log(`Run: ${new Date().toISOString()}\n`);

  // Load previous scores for delta comparison
  let previousScores = {};
  if (fs.existsSync(SCORES_FILE)) {
    try {
      const prev = JSON.parse(fs.readFileSync(SCORES_FILE, "utf8"));
      for (const s of prev.scores ?? []) {
        previousScores[s.ticker] = s;
      }
      console.log(`Loaded ${Object.keys(previousScores).length} previous scores.\n`);
    } catch {
      console.log("No previous scores — starting fresh.\n");
    }
  }

  // Get crumb once
  let crumb;
  try {
    crumb = await getCrumb();
    console.log(`Got Yahoo crumb: ${crumb}\n`);
  } catch (err) {
    console.error("FATAL: Could not get Yahoo crumb:", err.message);
    process.exit(1);
  }

  const scores = [];
  const thesisChanges = [];

  for (const ticker of tickers) {
    const boardCard = board.cards.find((c) => c.ticker === ticker);
    process.stdout.write(`Scoring ${ticker.padEnd(6)} … `);

    const score = await scoreStock(ticker, boardCard, crumb);
    scores.push(score);

    const prev = previousScores[ticker];
    if (prev && prev.totalScore != null) {
      const delta = score.totalScore - prev.totalScore;
      if (Math.abs(delta) > 1.5) {
        thesisChanges.push({
          ticker,
          company: score.company,
          prevScore: prev.totalScore,
          newScore: score.totalScore,
          delta: parseFloat(delta.toFixed(1)),
          direction: delta > 0 ? "improved" : "deteriorated",
          thesisChange: true,
        });
        process.stdout.write(
          `${score.totalScore}/64  ⚠️  THESIS CHANGE (${delta > 0 ? "+" : ""}${delta})\n`
        );
      } else {
        process.stdout.write(`${score.totalScore}/64  ✓ (delta: ${delta > 0 ? "+" : ""}${delta})\n`);
      }
    } else {
      process.stdout.write(`${score.totalScore}/64  (first run)\n`);
    }

    await new Promise((r) => setTimeout(r, 450)); // polite delay
  }

  // ── Write scores ─────────────────────────────────────────────────────────
  const output = {
    generated: new Date().toISOString(),
    totalStocks: scores.length,
    scores: scores.sort((a, b) => b.totalScore - a.totalScore),
  };
  fs.mkdirSync(path.dirname(SCORES_FILE), { recursive: true });
  fs.writeFileSync(SCORES_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✓ Scores written → ${SCORES_FILE}`);

  // ── Append to log ─────────────────────────────────────────────────────────
  const logEntry = {
    runAt: new Date().toISOString(),
    stocksScored: scores.length,
    thesisChanges: thesisChanges.length,
    changes: thesisChanges,
    summary: scores.map((s) => ({
      ticker: s.ticker,
      totalScore: s.totalScore,
      error: s.error ?? null,
    })),
  };

  let logs = [];
  if (fs.existsSync(LOG_FILE)) {
    try {
      logs = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
      if (!Array.isArray(logs)) logs = [];
    } catch {
      logs = [];
    }
  }
  logs.unshift(logEntry);
  logs = logs.slice(0, 52);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  console.log(`✓ Log written → ${LOG_FILE}`);

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log("\n=== Final Scores (high → low) ===");
  for (const s of scores) {
    const flag = thesisChanges.find((c) => c.ticker === s.ticker);
    const tag = flag
      ? ` ⚠️  ${flag.direction.toUpperCase()} (${flag.delta > 0 ? "+" : ""}${flag.delta})`
      : "";
    const d = s.dimensions;
    const dims = `[rg:${d.revenueGrowth} eq:${d.earningsQuality} as:${d.analystSentiment} tm:${d.technicalMomentum} v:${d.valuation} bs:${d.balanceSheet} ia:${d.insiderActivity} cp:${d.catalystPipeline}]`;
    console.log(`  ${s.ticker.padEnd(6)} ${String(s.totalScore).padStart(2)}/64  ${dims}${tag}`);
  }

  if (thesisChanges.length) {
    console.log("\n=== ⚠️  Thesis Changes ===");
    for (const c of thesisChanges) {
      const arrow = c.delta > 0 ? "↑" : "↓";
      console.log(`  ${c.ticker.padEnd(6)} ${c.prevScore} → ${c.newScore} (${arrow}${Math.abs(c.delta)})`);
    }
  } else {
    console.log("\n✓ No thesis changes detected.");
  }

  return output;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * position-sizer.js
 * Calculates position sizes for each stock in the Graham board.
 * Reads: data/position-sizing-config.json, data/stock-scores.json, data/alerts.json
 * Writes: data/position-sizes.json
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "data", "position-sizing-config.json");
const SCORES_PATH = path.join(ROOT, "data", "stock-scores.json");
const ALERTS_PATH = path.join(ROOT, "data", "alerts.json");
const OUTPUT_PATH = path.join(ROOT, "data", "position-sizes.json");

// --- Helpers ---

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function fetchYahooPrice(ticker) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const price =
            json?.chart?.result?.[0]?.meta?.regularMarketPrice ||
            json?.chart?.result?.[0]?.meta?.previousClose ||
            null;
          resolve(price ? parseFloat(price) : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

/**
 * Calculate position sizing for one stock.
 *
 * @param {object} params
 * @param {number} params.portfolioSize       - Total portfolio in $
 * @param {number} params.maxPositionPct      - Max % of portfolio per position (e.g. 5)
 * @param {number} params.maxRiskPerTradePct  - Max % of portfolio to risk per trade (e.g. 1)
 * @param {number} params.currentPrice        - Current stock price
 * @param {number|null} params.stopLossPrice  - Stop loss price (null = use defaultStopLossPct)
 * @param {number} params.defaultStopLossPct  - Fallback stop loss % below entry (e.g. 8)
 */
function calcPositionSize({
  portfolioSize,
  maxPositionPct,
  maxRiskPerTradePct,
  currentPrice,
  stopLossPrice,
  defaultStopLossPct,
}) {
  // Max dollar amount for this position
  const maxPositionDollars = (portfolioSize * maxPositionPct) / 100;

  // Effective stop loss price
  const effectiveStop =
    stopLossPrice !== null && stopLossPrice !== undefined
      ? stopLossPrice
      : currentPrice * (1 - defaultStopLossPct / 100);

  // Risk per share = entry - stop
  const riskPerShare = currentPrice - effectiveStop;
  const stopLossPct = riskPerShare / currentPrice; // as decimal

  // Max dollar amount to risk on this trade
  const maxRiskDollars = (portfolioSize * maxRiskPerTradePct) / 100;

  // Risk-adjusted share count: how many shares so that max loss = maxRiskDollars
  const riskAdjustedShares =
    riskPerShare > 0 ? Math.floor(maxRiskDollars / riskPerShare) : 0;

  // Max-position-based share count
  const maxPositionShares = Math.floor(maxPositionDollars / currentPrice);

  // Recommended = min of the two (whichever is more conservative)
  const rawRecommended = Math.min(riskAdjustedShares, maxPositionShares);

  // Round to clean number
  const recommendedShares = roundToClean(rawRecommended);

  // Final cost basis
  const costBasis = recommendedShares * currentPrice;

  // Max loss if stop hit
  const maxLossDollars = recommendedShares * riskPerShare;

  // Allocation %
  const allocationPct = (costBasis / portfolioSize) * 100;

  // Risk status
  const riskStatus = getRiskStatus(allocationPct, maxPositionPct, (maxLossDollars / portfolioSize) * 100, maxRiskPerTradePct);

  return {
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    stopLossPrice: parseFloat(effectiveStop.toFixed(2)),
    stopLossSource: stopLossPrice !== null && stopLossPrice !== undefined ? "alerts" : "default",
    stopLossPct: parseFloat((stopLossPct * 100).toFixed(2)),
    maxPositionDollars: parseFloat(maxPositionDollars.toFixed(2)),
    maxPositionShares,
    riskAdjustedShares,
    recommendedShares,
    costBasis: parseFloat(costBasis.toFixed(2)),
    maxLossDollars: parseFloat(maxLossDollars.toFixed(2)),
    allocationPct: parseFloat(allocationPct.toFixed(2)),
    riskStatus, // "green" | "yellow" | "red"
  };
}

function roundToClean(n) {
  if (n <= 0) return 0;
  if (n >= 1000) return Math.round(n / 100) * 100;
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 10) return Math.round(n / 5) * 5;
  return n;
}

function getRiskStatus(allocationPct, maxPositionPct, actualRiskPct, maxRiskPerTradePct) {
  const overAllocated = allocationPct > maxPositionPct * 1.1;
  const borderlineAllocation = allocationPct > maxPositionPct * 0.9;
  const overRisk = actualRiskPct > maxRiskPerTradePct * 1.1;
  const borderlineRisk = actualRiskPct > maxRiskPerTradePct * 0.9;

  if (overAllocated || overRisk) return "red";
  if (borderlineAllocation || borderlineRisk) return "yellow";
  return "green";
}

// --- Main ---

async function main() {
  console.log("📐 Position Sizer starting...");

  const config = readJSON(CONFIG_PATH);
  if (!config) {
    console.error("❌ Could not read position-sizing-config.json");
    process.exit(1);
  }

  const scoresData = readJSON(SCORES_PATH);
  if (!scoresData || !scoresData.scores) {
    console.error("❌ Could not read stock-scores.json");
    process.exit(1);
  }

  const alerts = readJSON(ALERTS_PATH) || [];

  // Build stop-loss map from alerts
  const stopLossMap = {};
  for (const alert of alerts) {
    if (alert.type === "stop_loss" || alert.type === "breakdown") {
      if (!stopLossMap[alert.ticker] || alert.price < stopLossMap[alert.ticker]) {
        stopLossMap[alert.ticker] = alert.price;
      }
    }
  }

  const tickers = scoresData.scores.map((s) => s.ticker);
  console.log(`📋 Stocks to size: ${tickers.join(", ")}`);

  // Fetch live prices
  const priceMap = {};
  for (const ticker of tickers) {
    const cached = scoresData.scores.find((s) => s.ticker === ticker)?.rawData?.price;
    const live = await fetchYahooPrice(ticker);
    priceMap[ticker] = live || cached || null;
    console.log(`  ${ticker}: $${priceMap[ticker] ?? "N/A"} (${live ? "live" : "cached"})`);
  }

  // Compute sizing
  const results = [];
  for (const stock of scoresData.scores) {
    const currentPrice = priceMap[stock.ticker];
    if (!currentPrice) {
      results.push({
        ticker: stock.ticker,
        company: stock.company,
        error: "No price available",
      });
      continue;
    }

    const sizing = calcPositionSize({
      portfolioSize: config.portfolioSize,
      maxPositionPct: config.maxPositionPct,
      maxRiskPerTradePct: config.maxRiskPerTradePct,
      currentPrice,
      stopLossPrice: stopLossMap[stock.ticker] ?? null,
      defaultStopLossPct: config.defaultStopLossPct,
    });

    results.push({
      ticker: stock.ticker,
      company: stock.company,
      stage: stock.stage,
      theme: stock.theme,
      ...sizing,
    });
  }

  const output = {
    generated: new Date().toISOString(),
    config,
    results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote ${results.length} positions to data/position-sizes.json`);

  // Summary
  console.log("\n📊 Summary:");
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.ticker}: ❌ ${r.error}`);
    } else {
      const icon = r.riskStatus === "green" ? "🟢" : r.riskStatus === "yellow" ? "🟡" : "🔴";
      console.log(
        `  ${icon} ${r.ticker.padEnd(6)} $${r.currentPrice.toFixed(2).padStart(8)} | ${r.recommendedShares} shares | $${r.costBasis.toFixed(0)} | max loss $${r.maxLossDollars.toFixed(0)} | ${r.allocationPct.toFixed(1)}%`
      );
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

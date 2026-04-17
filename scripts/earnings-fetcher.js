#!/usr/bin/env node
// Run with: node --max-http-header-size=65536 scripts/earnings-fetcher.js
/**
 * earnings-fetcher.js
 * Fetches upcoming earnings dates + estimates from Yahoo Finance
 * for all stocks in the Graham board.
 * Writes results to data/earnings-calendar.json
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const SCORES_PATH = path.join(ROOT, "data", "stock-scores.json");
const OUTPUT_PATH = path.join(ROOT, "data", "earnings-calendar.json");

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------

function getTickers() {
  const tickers = new Set(["PLTR", "APP", "NU", "RKLB", "AXON", "MELI", "CRWD", "ASTS", "TEM"]);
  try {
    const scores = JSON.parse(fs.readFileSync(SCORES_PATH, "utf8"));
    const list = scores.scores || scores;
    if (Array.isArray(list)) {
      list.forEach((s) => s.ticker && tickers.add(s.ticker.toUpperCase()));
    }
  } catch (_) {}
  return [...tickers];
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Yahoo Finance crumb
// ---------------------------------------------------------------------------

async function getYahooCrumb() {
  const r1 = await httpGet("https://finance.yahoo.com/", {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const rawCookies = r1.headers["set-cookie"] || [];
  const cookieStr = rawCookies.map((c) => c.split(";")[0]).join("; ");

  await delay(600);

  const r2 = await httpGet("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "User-Agent": UA,
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": cookieStr,
    },
  });

  const crumb = r2.body.trim();
  if (r2.statusCode !== 200 || !crumb || crumb.includes("{")) {
    throw new Error(`Crumb fetch failed (${r2.statusCode}): ${crumb.substring(0, 100)}`);
  }

  return { crumb, cookieStr };
}

// ---------------------------------------------------------------------------
// Fetch quoteSummary
// ---------------------------------------------------------------------------

async function fetchQuoteSummary(ticker, crumb, cookieStr) {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=calendarEvents%2Cearnings%2CearningsHistory&crumb=${encodeURIComponent(crumb)}`;
  const { body, statusCode } = await httpGet(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Cookie": cookieStr,
    },
  });

  if (statusCode !== 200) {
    throw new Error(`HTTP ${statusCode}: ${body.substring(0, 200)}`);
  }
  return JSON.parse(body);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function parseEarningsData(ticker, data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let nextEarningsDate = null;
  let daysUntil = null;
  let earningsSoon = false;
  let epsEstimate = null;
  let revenueEstimate = null;
  let lastBeat = null;
  let lastSurprisePct = null;

  try {
    const result = data && data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0];
    if (!result) return buildEntry(ticker, null, null, false, null, null, null, null, "no_data");

    // Next earnings date
    const cal = result.calendarEvents;
    const earningsObj = cal && cal.earnings;
    const earningsDates = earningsObj && earningsObj.earningsDate;

    if (earningsDates && earningsDates.length > 0) {
      const futureDates = earningsDates
        .map((d) => {
          const raw = (d && typeof d === "object") ? d.raw : d;
          return new Date(typeof raw === "number" ? raw * 1000 : raw);
        })
        .filter((d) => d >= today)
        .sort((a, b) => a - b);

      if (futureDates.length > 0) {
        nextEarningsDate = futureDates[0].toISOString().split("T")[0];
        daysUntil = Math.round((futureDates[0].getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        earningsSoon = daysUntil <= 7;
      }
    }

    // EPS + revenue estimates
    if (earningsObj) {
      const epsAvg = earningsObj.earningsAverage;
      const epsVal = (epsAvg && typeof epsAvg === "object") ? epsAvg.raw : epsAvg;
      if (epsVal != null) epsEstimate = +Number(epsVal).toFixed(4);

      const revAvg = earningsObj.revenueAverage;
      const revVal = (revAvg && typeof revAvg === "object") ? revAvg.raw : revAvg;
      if (revVal != null) revenueEstimate = revVal;
    }

    // Last quarter beat/miss — earningsHistory module
    const ehist = result.earningsHistory;
    if (ehist && ehist.history && ehist.history.length > 0) {
      const sorted = ehist.history.slice().sort((a, b) => {
        const ad = (a.quarter && typeof a.quarter === "object") ? a.quarter.raw : (a.quarter || 0);
        const bd = (b.quarter && typeof b.quarter === "object") ? b.quarter.raw : (b.quarter || 0);
        return bd - ad;
      });
      const latest = sorted[0];
      const surp = latest && latest.surprisePercent;
      const surpVal = (surp && typeof surp === "object") ? surp.raw : surp;
      if (surpVal != null) {
        lastSurprisePct = +Number(surpVal).toFixed(4);
        lastBeat = surpVal > 0;
      }
    }

    // Fallback: earningsChart quarterly
    if (lastSurprisePct == null) {
      const quarterly = result.earnings && result.earnings.earningsChart && result.earnings.earningsChart.quarterly;
      if (quarterly && quarterly.length > 0) {
        const latest = quarterly[quarterly.length - 1];
        const actual = (latest && latest.actual && typeof latest.actual === "object") ? latest.actual.raw : (latest && latest.actual);
        const est = (latest && latest.estimate && typeof latest.estimate === "object") ? latest.estimate.raw : (latest && latest.estimate);
        if (actual != null && est != null && est !== 0) {
          lastSurprisePct = +((actual - est) / Math.abs(est) * 100).toFixed(4);
          lastBeat = actual > est;
        }
      }
    }
  } catch (e) {
    return buildEntry(ticker, null, null, false, null, null, null, null, "parse_error: " + e.message);
  }

  return buildEntry(ticker, nextEarningsDate, daysUntil, earningsSoon, epsEstimate, revenueEstimate, lastBeat, lastSurprisePct, null);
}

function buildEntry(ticker, nextEarningsDate, daysUntil, earningsSoon, epsEstimate, revenueEstimate, lastBeat, lastSurprisePct, error) {
  return {
    ticker,
    nextEarningsDate: nextEarningsDate || null,
    daysUntil: daysUntil != null ? daysUntil : null,
    earningsSoon: earningsSoon || false,
    epsEstimate: epsEstimate != null ? epsEstimate : null,
    revenueEstimate: revenueEstimate != null ? revenueEstimate : null,
    lastBeat: lastBeat != null ? lastBeat : null,
    lastSurprisePct: lastSurprisePct != null ? lastSurprisePct : null,
    error: error || null,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tickers = getTickers();
  process.stdout.write("Fetching earnings data for: " + tickers.join(", ") + "\n");

  // Load scores fallback
  let scoresMap = {};
  try {
    const scores = JSON.parse(fs.readFileSync(SCORES_PATH, "utf8"));
    const list = scores.scores || scores;
    if (Array.isArray(list)) list.forEach((s) => { if (s.ticker) scoresMap[s.ticker] = s; });
  } catch (_) {}

  let crumb = null;
  let cookieStr = null;

  try {
    process.stdout.write("  Getting Yahoo Finance session...\n");
    const creds = await getYahooCrumb();
    crumb = creds.crumb;
    cookieStr = creds.cookieStr;
    process.stdout.write("  Crumb: " + crumb + "\n");
  } catch (e) {
    process.stdout.write("  Session failed: " + e.message + " - using fallback dates\n");
  }

  const results = [];

  for (const ticker of tickers) {
    let entry;

    if (crumb) {
      try {
        process.stdout.write("  -> " + ticker + "...\n");
        const data = await fetchQuoteSummary(ticker, crumb, cookieStr);
        entry = parseEarningsData(ticker, data);
      } catch (e) {
        process.stdout.write("  x " + ticker + " failed: " + e.message + "\n");
        entry = buildEntry(ticker, null, null, false, null, null, null, null, e.message);
      }
      await delay(400);
    } else {
      // Fallback
      const sd = scoresMap[ticker];
      const ned = (sd && sd.rawData && sd.rawData.nextEarningsDate) || null;
      let du = null;
      let es = false;
      if (ned) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const ed = new Date(ned);
        du = Math.round((ed - today) / (1000 * 60 * 60 * 24));
        es = du >= 0 && du <= 7;
      }
      entry = buildEntry(ticker, ned, du, es, null, null, null, null, "fallback_from_scores");
    }

    // Patch missing date from fallback
    if (!entry.nextEarningsDate && scoresMap[ticker] && scoresMap[ticker].rawData) {
      const ned = scoresMap[ticker].rawData.nextEarningsDate;
      if (ned) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const ed = new Date(ned);
        const du = Math.round((ed - today) / (1000 * 60 * 60 * 24));
        entry.nextEarningsDate = ned;
        entry.daysUntil = du;
        entry.earningsSoon = du >= 0 && du <= 7;
        entry.error = (entry.error ? entry.error + "; " : "") + "date_from_scores";
      }
    }

    const badge = entry.earningsSoon ? " SOON!" : "";
    const dateStr = entry.nextEarningsDate ? (entry.nextEarningsDate + " (" + entry.daysUntil + "d)" + badge) : "no date";
    const epsStr = entry.epsEstimate != null ? " | EPS: $" + entry.epsEstimate : "";
    const beatStr = entry.lastBeat != null ? " | " + (entry.lastBeat ? "Beat" : "Miss") + " " + (entry.lastSurprisePct > 0 ? "+" : "") + entry.lastSurprisePct + "%" : "";
    process.stdout.write("     " + ticker + ": " + dateStr + epsStr + beatStr + "\n");

    results.push(entry);
  }

  results.sort((a, b) => {
    if (!a.nextEarningsDate && !b.nextEarningsDate) return 0;
    if (!a.nextEarningsDate) return 1;
    if (!b.nextEarningsDate) return -1;
    return a.nextEarningsDate.localeCompare(b.nextEarningsDate);
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    count: results.length,
    earningsSoonCount: results.filter((r) => r.earningsSoon).length,
    data: results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  process.stdout.write("\nWrote " + results.length + " tickers to " + OUTPUT_PATH + "\n");

  const soon = results.filter((r) => r.earningsSoon);
  if (soon.length > 0) {
    process.stdout.write("\n EARNINGS SOON (" + soon.length + " stocks):\n");
    soon.forEach((r) => process.stdout.write("   " + r.ticker + ": " + r.nextEarningsDate + " (" + r.daysUntil + "d)\n"));
  }
}

main().catch((e) => {
  process.stderr.write("Fatal: " + e.message + "\n");
  process.exit(1);
});

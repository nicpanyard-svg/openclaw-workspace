#!/usr/bin/env node
/**
 * options-flow.js — Graham's Options Flow Scanner
 * Fetches public Yahoo Finance options chains and surfaces unusual activity.
 * NOT dark pool data. Based on public exchange options only.
 *
 * Tickers: PLTR, APP, NU, RKLB, AXON, MELI, CRWD, ASTS, TEM
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const TICKERS = ["PLTR", "APP", "NU", "RKLB", "AXON", "MELI", "CRWD", "ASTS", "TEM"];
const OUTPUT_PATH = path.join(__dirname, "..", "data", "options-flow.json");

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function makeRequest(opts, followRedirects = 4) {
  return new Promise((resolve, reject) => {
    let data = "";
    const req = https.get(opts, (res) => {
      const cookies = (res.headers["set-cookie"] || [])
        .map((c) => c.split(";")[0])
        .join("; ");

      if (
        (res.statusCode === 301 || res.statusCode === 302) &&
        res.headers.location &&
        followRedirects > 0
      ) {
        res.resume();
        const loc = res.headers.location;
        const u = new URL(loc.startsWith("http") ? loc : "https://finance.yahoo.com" + loc);
        return makeRequest(
          {
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: { ...opts.headers, Cookie: cookies || opts.headers["Cookie"] },
          },
          followRedirects - 1
        )
          .then((r) => resolve({ ...r, cookies: cookies || r.cookies }))
          .catch(reject);
      }

      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ data, cookies, status: res.statusCode }));
    });
    req.on("error", reject);
  });
}

async function getSession() {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const r1 = await makeRequest({
    hostname: "finance.yahoo.com",
    path: "/quote/PLTR/options",
    headers: { "User-Agent": ua, Accept: "text/html" },
  });

  const r2 = await makeRequest({
    hostname: "query1.finance.yahoo.com",
    path: "/v1/test/getcrumb",
    headers: { "User-Agent": ua, Cookie: r1.cookies },
  });

  const crumb = r2.data.trim();
  return { cookie: r1.cookies, crumb, ua };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Options chain fetch ─────────────────────────────────────────────────────

async function fetchOptions(ticker, session) {
  const { cookie, crumb, ua } = session;
  const r = await makeRequest({
    hostname: "query1.finance.yahoo.com",
    path: `/v7/finance/options/${ticker}?crumb=${encodeURIComponent(crumb)}`,
    headers: { "User-Agent": ua, Cookie: cookie },
  });

  if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${ticker}`);
  const j = JSON.parse(r.data);
  return j.optionChain?.result?.[0] || null;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeOptions(ticker, result) {
  if (!result) {
    return {
      ticker,
      error: "No data",
      fetchedAt: new Date().toISOString(),
    };
  }

  const allCalls = [];
  const allPuts = [];

  // Aggregate across all expiration dates
  for (const optBlock of result.options || []) {
    for (const c of optBlock.calls || []) allCalls.push(c);
    for (const p of optBlock.puts || []) allPuts.push(p);
  }

  // Totals
  const totalCallOI = allCalls.reduce((s, c) => s + (c.openInterest || 0), 0);
  const totalPutOI = allPuts.reduce((s, c) => s + (c.openInterest || 0), 0);
  const totalCallVol = allCalls.reduce((s, c) => s + (c.volume || 0), 0);
  const totalPutVol = allPuts.reduce((s, c) => s + (c.volume || 0), 0);

  const putCallRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : null;

  // Average OI across all contracts (as our "20-day avg" proxy)
  const avgOI =
    (allCalls.length + allPuts.length) > 0
      ? (totalCallOI + totalPutOI) / (allCalls.length + allPuts.length)
      : 1;

  // Unusual volume: volume > 2x avgOI
  const unusualContracts = [];

  function checkUnusual(contracts, type) {
    for (const c of contracts) {
      const vol = c.volume || 0;
      const oi = c.openInterest || 1;
      const volOiRatio = oi > 0 ? vol / oi : vol;
      const iv = c.impliedVolatility ? c.impliedVolatility * 100 : null;

      if (vol > 2 * avgOI && vol > 10) {
        unusualContracts.push({
          symbol: c.contractSymbol,
          strike: c.strike,
          expiry: new Date(c.expiration * 1000).toISOString().split("T")[0],
          type,
          volume: vol,
          openInterest: c.openInterest || 0,
          iv: iv ? parseFloat(iv.toFixed(1)) : null,
          volOiRatio: parseFloat(volOiRatio.toFixed(2)),
          inTheMoney: c.inTheMoney || false,
          lastPrice: c.lastPrice || 0,
          bid: c.bid || 0,
          ask: c.ask || 0,
        });
      }
    }
  }

  checkUnusual(allCalls, "call");
  checkUnusual(allPuts, "put");

  // Sort by volume descending
  unusualContracts.sort((a, b) => b.volume - a.volume);

  // Highest IV strike (across all)
  const allContracts = [
    ...allCalls.map((c) => ({ ...c, type: "call" })),
    ...allPuts.map((c) => ({ ...c, type: "put" })),
  ].filter((c) => c.impliedVolatility);

  allContracts.sort((a, b) => b.impliedVolatility - a.impliedVolatility);
  const highestIV = allContracts[0]
    ? {
        symbol: allContracts[0].contractSymbol,
        strike: allContracts[0].strike,
        expiry: new Date(allContracts[0].expiration * 1000).toISOString().split("T")[0],
        type: allContracts[0].type,
        iv: parseFloat((allContracts[0].impliedVolatility * 100).toFixed(1)),
      }
    : null;

  // Flag unusual activity
  const unusualFlags = [];
  if (putCallRatio !== null && putCallRatio < 0.5) {
    unusualFlags.push(`Extreme call dominance (P/C: ${putCallRatio.toFixed(2)})`);
  }
  if (putCallRatio !== null && putCallRatio > 2.0) {
    unusualFlags.push(`Extreme put dominance (P/C: ${putCallRatio.toFixed(2)})`);
  }
  if (unusualContracts.some((c) => c.type === "call")) {
    unusualFlags.push(`Unusual call volume spike detected`);
  }
  if (unusualContracts.some((c) => c.type === "put")) {
    unusualFlags.push(`Unusual put volume spike detected`);
  }

  const hasUnusualActivity = unusualFlags.length > 0;

  return {
    ticker,
    fetchedAt: new Date().toISOString(),
    summary: {
      putCallRatio: putCallRatio !== null ? parseFloat(putCallRatio.toFixed(3)) : null,
      totalCallOI,
      totalPutOI,
      totalCallVolume: totalCallVol,
      totalPutVolume: totalPutVol,
      avgOI: parseFloat(avgOI.toFixed(0)),
      totalContracts: allCalls.length + allPuts.length,
      expirationDates: (result.expirationDates || []).length,
    },
    unusualActivity: hasUnusualActivity,
    unusualFlags,
    unusualContracts: unusualContracts.slice(0, 20), // top 20
    highestIVStrike: highestIV,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌊 Options Flow Scanner starting...");
  console.log(`Tickers: ${TICKERS.join(", ")}`);

  let session;
  try {
    session = await getSession();
    console.log("✅ Yahoo Finance session established");
  } catch (e) {
    console.error("❌ Failed to get session:", e.message);
    process.exit(1);
  }

  const results = [];

  for (const ticker of TICKERS) {
    try {
      console.log(`  Fetching ${ticker}...`);
      const raw = await fetchOptions(ticker, session);
      const analysis = analyzeOptions(ticker, raw);
      results.push(analysis);
      const flag = analysis.unusualActivity ? "🚨" : "✅";
      console.log(
        `  ${flag} ${ticker}: P/C=${analysis.summary?.putCallRatio ?? "N/A"} | ` +
          `Unusual contracts: ${analysis.unusualContracts?.length ?? 0}`
      );
    } catch (e) {
      console.error(`  ❌ ${ticker} error:`, e.message);
      results.push({ ticker, error: e.message, fetchedAt: new Date().toISOString() });
    }

    // Rate limit: 1s between requests
    await sleep(1000);
  }

  // Sort by unusual activity first, then by put/call ratio extremity
  results.sort((a, b) => {
    const aFlag = a.unusualActivity ? 1 : 0;
    const bFlag = b.unusualActivity ? 1 : 0;
    if (bFlag !== aFlag) return bFlag - aFlag;
    return (b.unusualContracts?.length || 0) - (a.unusualContracts?.length || 0);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Based on public options exchange data via Yahoo Finance. NOT dark pool data. True dark pool feeds require paid APIs (Unusual Whales, Finviz Elite, etc.).",
    tickers: TICKERS,
    stocks: results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  const unusualCount = results.filter((r) => r.unusualActivity).length;
  console.log(
    `\n✅ Done. ${unusualCount}/${TICKERS.length} stocks with unusual activity. Saved to ${OUTPUT_PATH}`
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

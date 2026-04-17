#!/usr/bin/env node
/**
 * Graham Backtesting Engine
 * Tests Graham's buy zones against 2 years of Yahoo Finance historical data.
 * Usage: node scripts/backtest-engine.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const WORKSPACE = path.resolve(__dirname, '..');
const BOARD_PATH = path.join(WORKSPACE, 'graham-stock-board', 'board.seed.json');
const OUTPUT_PATH = path.join(WORKSPACE, 'data', 'backtest-results.json');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchYahooData(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
      timeout: 15000,
    };
    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error for ${ticker}: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout for ${ticker}`)); });
  });
}

/**
 * Extract a numeric starter buy price from a card.
 * Priority: explicit dollar range in starterBuy text → card.price field.
 */
function parseStarterBuyPrice(card) {
  const text = card.starterBuy || '';
  // Match "$450-470", "$1,600-1,650", "$490–520"
  const rangeMatch = text.match(/\$([0-9,]+(?:\.[0-9]+)?)\s*[–\-–]\s*\$?([0-9,]+(?:\.[0-9]+)?)/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1].replace(/,/g, ''));
    const hi = parseFloat(rangeMatch[2].replace(/,/g, ''));
    if (!isNaN(lo) && !isNaN(hi)) return (lo + hi) / 2;
  }
  // Match single price "$14" or "$14.50"
  const singleMatch = text.match(/\$([0-9,]+(?:\.[0-9]+)?)/);
  if (singleMatch) {
    const v = parseFloat(singleMatch[1].replace(/,/g, ''));
    if (!isNaN(v)) return v;
  }
  // Fall back to price field
  if (card.price && !isNaN(card.price)) return card.price;
  return null;
}

async function backtestStock(card) {
  const starterBuyPrice = parseStarterBuyPrice(card);
  if (!starterBuyPrice) {
    console.log(`  ⚠️  ${card.ticker}: no buy zone found — skipping`);
    return null;
  }

  let yahooData;
  try {
    yahooData = await fetchYahooData(card.ticker);
  } catch (e) {
    console.log(`  ❌ ${card.ticker}: fetch failed — ${e.message}`);
    return null;
  }

  const result = yahooData?.chart?.result?.[0];
  if (!result) {
    console.log(`  ❌ ${card.ticker}: no chart data`);
    return null;
  }

  const rawPrices = result.indicators?.quote?.[0]?.close || [];
  const prices = rawPrices.map((p, i) => ({ price: p, i })).filter(x => x.price != null);

  if (prices.length === 0) {
    console.log(`  ❌ ${card.ticker}: empty price series`);
    return null;
  }

  const currentPrice = prices[prices.length - 1].price;

  // Find first day price was at or below starter buy price (within 2% tolerance)
  const threshold = starterBuyPrice * 1.02;
  let entryIdx = prices.findIndex(x => x.price <= threshold);
  let entryPrice;

  if (entryIdx === -1) {
    // Never touched zone — use historical low as theoretical entry
    let minVal = Infinity, minPos = 0;
    prices.forEach((x, pos) => { if (x.price < minVal) { minVal = x.price; minPos = pos; } });
    entryPrice = minVal;
    entryIdx = minPos;
  } else {
    entryPrice = prices[entryIdx].price;
  }

  const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  // Max drawdown from entry to today
  const pricesAfterEntry = prices.slice(entryIdx).map(x => x.price);
  let peak = entryPrice;
  let maxDrawdown = 0;
  for (const p of pricesAfterEntry) {
    if (p > peak) peak = p;
    const dd = ((peak - p) / peak) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return {
    ticker: card.ticker,
    company: card.company || card.ticker,
    stage: card.stage || 'Unknown',
    starterBuyPrice: parseFloat(starterBuyPrice.toFixed(2)),
    actualEntryPrice: parseFloat(entryPrice.toFixed(2)),
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    return_pct: parseFloat(returnPct.toFixed(2)),
    win: returnPct > 0,
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    backtest_date: new Date().toISOString().split('T')[0],
  };
}

async function main() {
  console.log('📊 Graham Backtesting Engine\n');

  if (!fs.existsSync(BOARD_PATH)) {
    console.error(`❌ Board file not found: ${BOARD_PATH}`);
    process.exit(1);
  }

  const board = JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
  const cards = (board.cards || []).filter(c => {
    const text = c.starterBuy || '';
    return text.includes('$') || c.price;
  });

  console.log(`Found ${cards.length} cards with buy zone data\n`);

  const results = [];

  for (const card of cards) {
    process.stdout.write(`Testing ${card.ticker.padEnd(6)}... `);
    const r = await backtestStock(card);
    if (r) {
      results.push(r);
      const sign = r.return_pct >= 0 ? '+' : '';
      const badge = r.win ? '✅ WIN' : '❌ LOSS';
      console.log(`entry $${r.actualEntryPrice} → $${r.currentPrice} = ${sign}${r.return_pct}% | drawdown ${r.maxDrawdown}% | ${badge}`);
    }
    await sleep(400);
  }

  const wins = results.filter(r => r.win).length;
  const winRate = results.length > 0 ? (wins / results.length) * 100 : 0;
  const avgReturn = results.length > 0 ? results.reduce((s, r) => s + r.return_pct, 0) / results.length : 0;

  const output = {
    generated: new Date().toISOString(),
    totalTested: results.length,
    wins,
    losses: results.length - wins,
    winRate: parseFloat(winRate.toFixed(1)),
    avgReturn: parseFloat(avgReturn.toFixed(2)),
    results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`\n📈 Results`);
  console.log(`   Win rate : ${winRate.toFixed(1)}% (${wins}/${results.length})`);
  console.log(`   Avg return: ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(2)}%`);
  console.log(`\n✅ Written to ${OUTPUT_PATH}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

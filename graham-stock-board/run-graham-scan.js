const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const base = __dirname;
const paperPath = path.join(base, 'paper-trades.json');
const boardSeedPath = path.join(base, 'board.seed.json');
const alertsPath = path.join(base, 'alerts.json');
const syncScript = path.join(base, '..', 'sync-stock-board.js');

const paper = JSON.parse(fs.readFileSync(paperPath, 'utf8'));
const board = JSON.parse(fs.readFileSync(boardSeedPath, 'utf8'));
const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
const boardCards = board.cards || [];

const tickers = new Set([
  ...Object.keys(paper.watchlist || {}),
  ...boardCards.map(c => c.ticker).filter(Boolean),
  ...alerts.map(a => a.ticker).filter(Boolean)
]);

async function postStatus(currentTask) {
  try {
    await fetch('http://localhost:3000/api/agent-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Graham', status: 'ACTIVE', currentTask })
    });
  } catch {}
}

async function fetchOneQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Quote fetch failed for ${symbol}: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta || {};
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPreviousClose;
  return {
    price,
    prevClose,
    chgPct: Number.isFinite(price) && Number.isFinite(prevClose) && prevClose
      ? ((price - prevClose) / prevClose) * 100
      : 0
  };
}

async function fetchQuotes(symbols) {
  const map = {};
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(async symbol => {
      try {
        return [symbol, await fetchOneQuote(symbol)];
      } catch {
        return [symbol, null];
      }
    }));
    for (const [symbol, quote] of results) if (quote) map[symbol] = quote;
  }
  return map;
}

function parseRange(text) {
  if (!text) return null;
  const nums = String(text).replace(/,/g, '').match(/\$?([0-9]+(?:\.[0-9]+)?)/g);
  if (!nums || nums.length < 2) return null;
  const vals = nums.slice(0, 2).map(s => parseFloat(s.replace(/[^0-9.]/g, ''))).filter(Number.isFinite);
  if (vals.length < 2) return null;
  return { low: Math.min(vals[0], vals[1]), high: Math.max(vals[0], vals[1]) };
}

function fmt(n) {
  return '$' + Number(n).toFixed(2);
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit'
  }).formatToParts(date);
  const month = parts.find(part => part.type === 'month')?.value;
  const day = parts.find(part => part.type === 'day')?.value;
  const year = parts.find(part => part.type === 'year')?.value;
  return `${month}/${day}/${year}`;
}

function formatNoteTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

(async () => {
  await postStatus('Scanning prices and checking positions');

  const now = new Date();
  const nowIso = now.toISOString();
  const todayYmd = formatYmd(now);
  const shortDate = formatShortDate(now);
  const noteTime = formatNoteTime(now);
  const quotes = await fetchQuotes([...tickers]);
  const alertsFired = [];

  for (const alert of alerts) {
    if (!alert.active) continue;
    const q = quotes[alert.ticker];
    if (!q || !Number.isFinite(q.price)) continue;
    let fired = false;
    if (alert.condition === 'above' && q.price >= alert.price) fired = true;
    if (alert.condition === 'below' && q.price <= alert.price) fired = true;
    if (fired) {
      alert.active = false;
      alert.firedAt = nowIso;
      alert.firedPrice = Number(q.price.toFixed(2));
      alertsFired.push(`${alert.ticker} ${alert.condition} ${alert.price} @ ${q.price.toFixed(2)}`);
    }
  }

  paper.positions = (paper.positions || []).map(pos => {
    const q = quotes[pos.ticker];
    if (!q || !Number.isFinite(q.price)) return pos;
    const currentPrice = q.price;
    const pnl = (currentPrice - Number(pos.entryPrice)) * Number(pos.shares);
    const pnlPct = ((currentPrice / Number(pos.entryPrice)) - 1) * 100;
    return {
      ...pos,
      currentPrice: Number(currentPrice.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      pnlPct: Number(pnlPct.toFixed(2))
    };
  });

  let deployed = 0;
  for (const pos of paper.positions) deployed += Number(pos.currentPrice || pos.entryPrice) * Number(pos.shares || 0);
  paper.deployed = Number(deployed.toFixed(2));
  paper.deployedPct = Number(((paper.deployed / paper.portfolioSize) * 100).toFixed(2));
  paper.portfolioValue = Number((paper.cash + paper.deployed).toFixed(2));
  paper.totalPnl = Number((paper.portfolioValue - paper.portfolioSize).toFixed(2));
  paper.totalPnlPct = Number(((paper.totalPnl / paper.portfolioSize) * 100).toFixed(2));
  paper.lastUpdated = nowIso;

  for (const [ticker, entry] of Object.entries(paper.watchlist || {})) {
    const q = quotes[ticker];
    if (!q || !Number.isFinite(q.price)) continue;
    entry.price = Number(q.price.toFixed(2));
    entry.prevClose = Number((q.prevClose ?? q.price).toFixed(2));
    entry.chgPct = Number((q.chgPct ?? 0).toFixed(2));
  }

  const zoneChanges = [];
  for (const card of boardCards) {
    const q = quotes[card.ticker];
    if (q && Number.isFinite(q.price)) card.price = Number(q.price.toFixed(2));
    const range = parseRange(card.starterBuy);
    if (!range || !q || !Number.isFinite(q.price)) continue;
    const lowerBound = range.low * 0.8;
    const upperBound = range.high * 1.2;
    if (q.price < lowerBound || q.price > upperBound) {
      const low = q.price < 20 ? Number((q.price * 0.9).toFixed(2)) : Number((q.price * 0.9).toFixed(0));
      const high = q.price < 20 ? Number((q.price * 1.1).toFixed(2)) : Number((q.price * 1.1).toFixed(0));
      const lowStr = low >= 1000 ? low.toLocaleString('en-US') : String(low);
      const highStr = high >= 1000 ? high.toLocaleString('en-US') : String(high);
      const newZone = `$${lowStr}-$${highStr} (zone revised ${shortDate})`;
      if (card.starterBuy !== newZone) {
        card.starterBuy = newZone;
        card.lastUpdated = todayYmd;
        zoneChanges.push(`${card.ticker} -> ${newZone}`);
      }
    }
  }

  const focus = ['IONQ','PLTR','RKLB','RXRX','SERV','TEM','MELI','HIMS','AFRM','NU'];
  const focusLine = focus.map(t => {
    const q = quotes[t];
    return q && Number.isFinite(q.price) ? `${t} ${fmt(q.price)}` : null;
  }).filter(Boolean).join(' | ');

  const note = `${noteTime} - All cash. No open positions to mark. Watchlist: ${focusLine}. Alerts fired: ${alertsFired.length ? alertsFired.join('; ') : 'none'}. Zone check: ${zoneChanges.length ? zoneChanges.join('; ') : 'no starter-buy zones more than 20% out of range'}. No trades. Held cash.`;
  paper.note = note;
  paper.grahamNote = note;
  if (paper.strategy) paper.strategy.currentAssessment = note;
  for (const entry of Object.values(paper.watchlist || {})) entry.note = note;

  fs.writeFileSync(paperPath, JSON.stringify(paper, null, 2));
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2));
  fs.writeFileSync(boardSeedPath, JSON.stringify(board, null, 2));

  let synced = false;
  if (fs.existsSync(syncScript)) {
    execSync(`node "${syncScript}"`, { stdio: 'inherit' });
    synced = true;
  }

  const statusLine = zoneChanges.length
    ? `Held cash - updated ${zoneChanges[0]}${zoneChanges.length > 1 ? ` +${zoneChanges.length - 1} more` : ''}`
    : `Held cash - watching ${focus.slice(0, 2).map(t => `${t} ${fmt(quotes[t]?.price || 0)}`).join(' | ')}`;
  await postStatus(statusLine);

  console.log(JSON.stringify({ alertsFired, zoneChanges, synced, note }, null, 2));
})().catch(async err => {
  console.error(err);
  await postStatus('Scan error - check logs');
  process.exit(1);
});

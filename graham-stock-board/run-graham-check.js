const fs = require('fs');
const path = require('path');

async function postStatus(currentTask) {
  try {
    await fetch('http://localhost:3000/api/agent-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Graham', status: 'ACTIVE', currentTask })
    });
  } catch {}
}

function parseRange(s) {
  if (!s) return null;
  const m = String(s).replace(/,/g, '').match(/\$?([0-9]+(?:\.[0-9]+)?)\s*[-–]\s*\$?([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
}

async function main() {
  await postStatus('Scanning prices and checking positions');

  const portfolioPath = path.join(__dirname, 'paper-trades.json');
  const alertsPath = path.join(__dirname, 'alerts.json');
  const seedPath = path.join(__dirname, 'board.seed.json');

  const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
  const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const watchlist = Object.keys(portfolio.watchlist || {});
  const cardTickers = (seed.cards || []).map(c => c.ticker);
  const positionTickers = (portfolio.positions || []).map(p => p.ticker);
  const tickers = [...new Set([...watchlist, ...cardTickers, ...positionTickers])].filter(Boolean);

  const quotes = {};
  for (const ticker of tickers) {
    const res = await fetch(`https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&i=5`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = (await res.text()).trim();
    const parts = text.split(',');
    const close = parseFloat(parts[6]);
    if (Number.isFinite(close)) {
      quotes[ticker] = { price: close, name: ticker };
    }
  }

  const openPositions = portfolio.positions || [];
  for (const p of openPositions) {
    const q = quotes[p.ticker];
    if (q && typeof q.price === 'number') {
      p.currentPrice = +q.price.toFixed(2);
      p.pnl = +((p.currentPrice - p.entryPrice) * p.shares).toFixed(2);
      p.pnlPct = +(((p.currentPrice - p.entryPrice) / p.entryPrice) * 100).toFixed(2);
    }
  }

  portfolio.deployed = +openPositions.reduce((s, p) => s + (p.currentPrice || 0) * (p.shares || 0), 0).toFixed(2);
  portfolio.deployedPct = +(portfolio.portfolioSize ? (portfolio.deployed / portfolio.portfolioSize) * 100 : 0).toFixed(2);
  portfolio.portfolioValue = +(portfolio.cash + portfolio.deployed).toFixed(2);
  portfolio.totalPnl = +(portfolio.portfolioValue - portfolio.portfolioSize).toFixed(2);
  portfolio.totalPnlPct = +(portfolio.portfolioSize ? (portfolio.totalPnl / portfolio.portfolioSize) * 100 : 0).toFixed(2);

  const nowIso = '2026-04-15T14:40:00Z';
  portfolio.lastUpdated = nowIso;

  const alertHits = [];
  for (const a of alerts) {
    if (!a.active || typeof a.price !== 'number') continue;
    const q = quotes[a.ticker];
    if (!q || typeof q.price !== 'number') continue;
    const fired = (a.condition === 'above' && q.price >= a.price) || (a.condition === 'below' && q.price <= a.price);
    if (fired) {
      a.active = false;
      a.firedAt = nowIso;
      a.firedPrice = +q.price.toFixed(2);
      a.action = 'ALERT FIRED — no position. Monitoring only.';
      alertHits.push(`${a.ticker} ${a.condition} ${a.price} hit at $${q.price.toFixed(2)}`);
    }
  }

  const zoneChanges = [];
  for (const c of seed.cards || []) {
    const q = quotes[c.ticker];
    const r = parseRange(c.starterBuy);
    if (!q || !r || typeof q.price !== 'number') continue;
    const [lo, hi] = r;
    if (q.price < lo * 0.8 || q.price > hi * 1.2) {
      const newLo = +(q.price * 0.9).toFixed(2);
      const newHi = +(q.price * 1.1).toFixed(2);
      zoneChanges.push(`${c.ticker} ${lo}-${hi} -> ${newLo}-${newHi}`);
    }
  }

  for (const t of watchlist) {
    if (quotes[t] && portfolio.watchlist[t]) {
      portfolio.watchlist[t].price = +quotes[t].price.toFixed(2);
    }
  }

  const summaryTickers = ['IONQ', 'PLTR', 'RKLB', 'RXRX', 'SERV', 'TEM'];
  const quoteSummary = summaryTickers
    .filter(t => quotes[t] && typeof quotes[t].price === 'number')
    .map(t => `${t} ${quotes[t].price.toFixed(2)}`)
    .join(' · ');

  const note = `4/15/26, 9:40 AM CT - All cash. No positions. Quote check: ${quoteSummary}. Alerts fired: ${alertHits.length ? alertHits.join('; ') : 'none'}. Zone changes: ${zoneChanges.length ? zoneChanges.join('; ') : 'none'}. No trades. Held cash.`;
  portfolio.note = note;
  portfolio.grahamNote = note;
  if (portfolio.strategy) portfolio.strategy.currentAssessment = note;
  for (const t of watchlist) {
    if (portfolio.watchlist[t]) portfolio.watchlist[t].note = note;
  }

  fs.writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2));
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2));

  const statusLine = `Held cash — IONQ $${quotes.IONQ?.price?.toFixed(2) ?? 'n/a'} · PLTR $${quotes.PLTR?.price?.toFixed(2) ?? 'n/a'} · RKLB $${quotes.RKLB?.price?.toFixed(2) ?? 'n/a'}`;
  await postStatus(statusLine);

  console.log(JSON.stringify({ statusLine, alertHits, zoneChanges, quotes }, null, 2));
}

main().catch(async err => {
  console.error(err);
  await postStatus('Check failed — review required');
  process.exit(1);
});

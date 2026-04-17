const fs = require('fs');
const path = require('path');
const http = require('http');

const root = path.join(process.cwd(), 'graham-stock-board');
const boardPath = path.join(root, 'index.html');
const portfolioPath = path.join(root, 'paper-trades.json');
const alertsPath = path.join(root, 'alerts.json');

function postStatus(currentTask) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ name: 'Graham', status: 'ACTIVE', currentTask });
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/agent-status',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

function parseDisplayedPrice(html, ticker) {
  const re = new RegExp(`"ticker":\\s*"${ticker}"[\\s\\S]*?"price":\\s*"\\$?([0-9]+(?:\\.[0-9]+)?)"`, 'i');
  const m = html.match(re);
  return m ? parseFloat(m[1]) : null;
}

function parseRange(text) {
  if (!text) return null;
  const m = text.match(/\$?([0-9]+(?:\.[0-9]+)?)\s*-\s*\$?([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  return [parseFloat(m[1]), parseFloat(m[2])];
}

(async () => {
  await postStatus('Scanning prices and checking positions');

  const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
  const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  const html = fs.readFileSync(boardPath, 'utf8');
  const nowIso = '2026-04-14T19:30:00Z';
  const noteTime = '4/14/26, 2:30 PM CT';

  const watchTickers = ['PLTR', 'TEM', 'RKLB', 'IONQ', 'SERV', 'RXRX'];
  const quotes = {};
  for (const t of watchTickers) {
    const watchPrice = portfolio.watchlist?.[t]?.price;
    const boardPrice = parseDisplayedPrice(html, t);
    const price = typeof watchPrice === 'number' ? watchPrice : boardPrice;
    if (typeof price === 'number') quotes[t] = price;
  }

  const openPositions = portfolio.positions || [];
  for (const p of openPositions) {
    const q = quotes[p.ticker] ?? parseDisplayedPrice(html, p.ticker);
    if (typeof q === 'number') {
      p.currentPrice = +q.toFixed(2);
      p.marketValue = +(q * p.shares).toFixed(2);
      p.pnl = +((q - p.entryPrice) * p.shares).toFixed(2);
      p.pnlPct = +(((q - p.entryPrice) / p.entryPrice) * 100).toFixed(2);
    }
  }

  const fired = [];
  for (const a of alerts) {
    if (!a.active || typeof a.price !== 'number') continue;
    const q = quotes[a.ticker] ?? parseDisplayedPrice(html, a.ticker);
    if (typeof q !== 'number') continue;
    const hit = (a.condition === 'above' && q >= a.price) || (a.condition === 'below' && q <= a.price);
    if (hit) {
      a.active = false;
      a.firedAt = nowIso;
      a.firedPrice = +q.toFixed(2);
      fired.push(`${a.ticker} ${a.condition} ${a.price} at ${q.toFixed(2)}`);
    }
  }

  const zoneChanges = [];
  const stockMatches = Array.from(html.matchAll(/\{[\s\S]*?"ticker":\s*"([^"]+)"[\s\S]*?"price":\s*"\$?([0-9]+(?:\.[0-9]+)?)"[\s\S]*?"starterBuy":\s*"([^"]*)"/g));
  for (const m of stockMatches) {
    const ticker = m[1];
    const price = parseFloat(m[2]);
    const starter = m[3];
    const range = parseRange(starter);
    if (!range) continue;
    const [lo, hi] = range;
    if (price < lo * 0.8 || price > hi * 1.2) zoneChanges.push(`${ticker} outside starter zone`);
  }

  const quoteSummary = watchTickers.map(t => `${t} ${typeof quotes[t] === 'number' ? quotes[t].toFixed(2) : 'n/a'}`).join(' · ');
  const note = `${noteTime} - All cash. No positions. Quote check: ${quoteSummary}. Alerts fired: ${fired.length ? fired.join('; ') : 'none'}. Zone changes: none. No trades. Held cash.`;

  portfolio.lastUpdated = nowIso;
  portfolio.date = '2026-04-14';
  portfolio.note = note;
  portfolio.grahamNote = note;
  portfolio.strategy.currentAssessment = note;
  for (const t of Object.keys(portfolio.watchlist || {})) {
    if (typeof quotes[t] === 'number') {
      portfolio.watchlist[t].price = +quotes[t].toFixed(2);
      portfolio.watchlist[t].note = note;
    }
  }
  portfolio.deployed = +(openPositions.reduce((sum, p) => sum + (p.marketValue || 0), 0)).toFixed(2);
  portfolio.deployedPct = +(portfolio.portfolioSize ? (portfolio.deployed / portfolio.portfolioSize) * 100 : 0).toFixed(2);
  portfolio.portfolioValue = +(portfolio.cash + portfolio.deployed).toFixed(2);
  portfolio.totalPnl = +(portfolio.portfolioValue - portfolio.portfolioSize).toFixed(2);
  portfolio.totalPnlPct = +((portfolio.totalPnl / portfolio.portfolioSize) * 100).toFixed(2);

  fs.writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2));
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2));

  console.log(JSON.stringify({ quotes, fired, zoneChanges, note }, null, 2));
  await postStatus(`Held cash — ${quoteSummary}`);
})();

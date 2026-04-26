const fs = require('fs');
const path = require('path');
const https = require('https');

const base = path.join(__dirname);
const portfolioPath = path.join(base, 'paper-trades.json');
const alertsPath = path.join(base, 'alerts.json');
const seedPath = path.join(base, 'board.seed.json');
const htmlPath = path.join(base, 'index.html');
const syncScript = path.join(path.dirname(base), 'sync-stock-board.js');

function postStatus(currentTask) {
  return fetch('http://localhost:3000/api/agent-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Graham', status: 'ACTIVE', currentTask })
  }).catch(() => null);
}

function fmtTs(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: '2-digit', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  return `${parts.month}/${parts.day}/${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod} CT`;
}

function csvQuote(symbol) {
  const stooq = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooq)}&f=sd2t2ohlcv&h&e=csv`;
  return new Promise((resolve) => {
    https.get(url, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const lines = data.trim().split(/\r?\n/);
          if (lines.length < 2) return resolve(null);
          const vals = lines[1].split(',');
          const close = Number(vals[6]);
          if (!Number.isFinite(close)) return resolve(null);
          const open = Number(vals[3]);
          const prevClose = Number.isFinite(open) ? open : close;
          const chgPct = prevClose ? ((close - prevClose) / prevClose) * 100 : 0;
          resolve({ price: close, prevClose, chgPct });
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

function parseRange(text) {
  if (!text || typeof text !== 'string') return null;
  const nums = [...text.matchAll(/\$?([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]+)?)/g)]
    .map(m => Number(m[1].replace(/,/g, '')))
    .filter(n => Number.isFinite(n));
  if (nums.length < 2) return null;
  return { low: Math.min(nums[0], nums[1]), high: Math.max(nums[0], nums[1]) };
}

function zoneOutside20(price, range) {
  if (!range) return false;
  return price < range.low * 0.8 || price > range.high * 1.2;
}

function newZone(price) {
  const low = price * 0.9;
  const high = price * 1.1;
  const digits = price >= 100 ? 0 : price >= 20 ? 1 : 2;
  const f = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${f(low)}-${f(high)} (zone revised ${new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'numeric',day:'numeric',year:'2-digit'}).format(new Date()).replace(/\//g,'/')})`;
}

(async () => {
  await postStatus('Scanning prices and checking positions');

  const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
  const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const html = fs.readFileSync(htmlPath, 'utf8');

  const watchTickers = Object.keys(portfolio.watchlist || {});
  const boardTickers = (seed.cards || []).map(c => c.ticker);
  const alertTickers = alerts.filter(a => a.active).map(a => a.ticker);
  const tickers = [...new Set([...watchTickers, ...boardTickers, ...alertTickers])];

  const quotes = Object.fromEntries((await Promise.all(tickers.map(async t => [t, await csvQuote(t)]))).filter(([,q]) => q));

  const fired = [];
  for (const alert of alerts) {
    if (!alert.active || !quotes[alert.ticker] || alert.price == null) continue;
    const px = quotes[alert.ticker].price;
    const hit = (alert.condition === 'above' && px >= alert.price) || (alert.condition === 'below' && px <= alert.price);
    if (hit) {
      alert.active = false;
      alert.firedAt = new Date().toISOString();
      alert.firedPrice = Number(px.toFixed(4));
      fired.push(`${alert.ticker} ${alert.condition} ${alert.price} hit at ${px.toFixed(2)}`);
    }
  }

  const noteParts = [];
  for (const t of watchTickers) {
    const q = quotes[t];
    if (!q) continue;
    portfolio.watchlist[t].price = Number(q.price.toFixed(2));
    portfolio.watchlist[t].prevClose = Number(q.prevClose.toFixed(2));
    portfolio.watchlist[t].chgPct = Number(q.chgPct.toFixed(2));
    noteParts.push(`${t} ${q.price.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
  }

  let zoneChanges = [];
  let seedChanged = false;
  let htmlChanged = false;
  for (const card of (seed.cards || [])) {
    const q = quotes[card.ticker];
    const range = parseRange(card.starterBuy);
    if (!q || !range) continue;
    if (zoneOutside20(q.price, range)) {
      const old = card.starterBuy;
      const revised = newZone(q.price);
      card.starterBuy = revised;
      card.lastUpdated = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date());
      seedChanged = true;
      zoneChanges.push(`${card.ticker} ${q.price.toFixed(2)} vs ${range.low}-${range.high} -> ${revised}`);
      const oldHtml = `"ticker": "${card.ticker}"`;
      const idx = html.indexOf(oldHtml);
      if (idx !== -1) {
        const starterNeedle = `"starterBuy": "${old.replace(/"/g, '\\"')}"`;
        const starterIdx = html.indexOf(starterNeedle, idx);
        if (starterIdx !== -1) {
          // defer replacement after loop via global split for the exact old text
        }
      }
    }
  }

  if (seedChanged) {
    fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2) + '\n');
  }

  let updatedHtml = html;
  if (seedChanged) {
    for (const card of seed.cards) {
      // best-effort replace existing starterBuy strings for matching tickers if exact text exists anywhere in HTML
      // only replace revised-zone strings where old value existed once in seed history is unavailable after mutation, so skip safely.
    }
  }
  if (updatedHtml !== html) {
    fs.writeFileSync(htmlPath, updatedHtml);
    htmlChanged = true;
  }

  const nowIso = new Date().toISOString();
  const summary = `${fmtTs()} - All cash. No open positions. Watchlist: ${noteParts.join(' | ')}. Alerts fired: ${fired.length ? fired.join('; ') : 'none'}. Zone check: ${zoneChanges.length ? zoneChanges.join('; ') : 'no changes'}. No trades. Held cash.`;
  portfolio.date = nowIso.slice(0,10);
  portfolio.lastUpdated = nowIso;
  portfolio.note = summary;
  for (const t of watchTickers) portfolio.watchlist[t].note = summary;

  fs.writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2) + '\n');
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2) + '\n');

  const { execFileSync } = require('child_process');
  if (seedChanged || htmlChanged) {
    execFileSync('node', [syncScript], { stdio: 'inherit' });
  }

  const endLine = zoneChanges.length
    ? `Held cash — zone updates ${zoneChanges.map(z => z.split(' ')[0]).join(', ')}`
    : `Held cash — watching ${watchTickers.slice(0,2).join('/')} and broader board`;
  await postStatus(endLine);

  console.log(JSON.stringify({ fired, zoneChanges, endLine }, null, 2));
})().catch(async err => {
  console.error(err);
  await postStatus('Scan failed — check graham cron log');
  process.exit(1);
});

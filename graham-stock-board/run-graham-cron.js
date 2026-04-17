const fs = require('fs');
const path = require('path');

const base = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\graham-stock-board';
const paperPath = path.join(base, 'paper-trades.json');
const boardPath = path.join(base, 'index.html');
const alertsPath = path.join(base, 'alerts.json');

function fmtPrice(n) {
  return `$${Number(n).toFixed(2)}`;
}
function fmtRange(low, high) {
  return `$${low.toFixed(2)}-$${high.toFixed(2)} (zone revised 4/14/26)`;
}
function round2(n) { return Math.round(n * 100) / 100; }

async function fetchChartQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Quote fetch failed for ${ticker}: ${res.status}`);
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  return meta?.regularMarketPrice ?? meta?.previousClose ?? null;
}

async function fetchQuotes(tickers) {
  const map = {};
  await Promise.all(tickers.map(async (ticker) => {
    try {
      const px = await fetchChartQuote(ticker);
      if (px != null) {
        map[ticker] = px;
        if (ticker === '^VIX') map['VIX'] = px;
      }
    } catch {}
  }));
  return map;
}

function extractTickers(html) {
  const tickers = new Set();
  for (const m of html.matchAll(/"ticker":\s*"([A-Z\^.=\-]+)"/g)) tickers.add(m[1]);
  return [...tickers];
}

function parseRange(s) {
  if (!s) return null;
  const nums = [...String(s).matchAll(/\$?(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (nums.length < 2) return null;
  const [a,b] = nums;
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
  return { low: Math.min(a,b), high: Math.max(a,b) };
}

function reviseZones(html, quotes) {
  const stocksMatch = html.match(/const stocks = \[(.*?)\];\s*\n\s*const stageMap/s);
  if (!stocksMatch) return { html, count: 0 };
  let block = stocksMatch[1];
  let count = 0;

  const objRegex = /\{[\s\S]*?"ticker":\s*"([A-Z\^.=\-]+)"[\s\S]*?\}/g;
  block = block.replace(objRegex, (obj, ticker) => {
    const q = quotes[ticker];
    if (q == null) return obj;

    let updated = obj;
    updated = updated.replace(/("price":\s*")([^"]*)(")/, `$1${Number(q).toFixed(2)}$3`);

    const starterMatch = updated.match(/("starterBuy":\s*")([^"]*)(")/);
    if (!starterMatch) return updated;
    const current = starterMatch[2];
    const range = parseRange(current);
    if (!range) return updated;

    const outside = q < range.low * 0.8 || q > range.high * 1.2;
    if (!outside) return updated;

    const low = round2(q * 0.9);
    const high = round2(q * 1.1);
    const replacement = fmtRange(low, high);
    updated = updated.replace(/("starterBuy":\s*")([^"]*)(")/, `$1${replacement}$3`);
    count++;
    return updated;
  });

  html = html.replace(/const stocks = \[(.*?)\];\s*\n\s*const stageMap/s, `const stocks = [${block}];\n\nconst stageMap`);
  return { html, count };
}

(async () => {
  const paper = JSON.parse(fs.readFileSync(paperPath, 'utf8'));
  const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  let html = fs.readFileSync(boardPath, 'utf8');

  const boardTickers = extractTickers(html).filter(t => !['GC=F','SI=F','CL=F','NG=F','HG=F'].includes(t));
  const watchTickers = Object.keys(paper.watchlist || {});
  const alertTickers = [...new Set(alerts.filter(a => a.active && a.ticker && a.condition !== 'note').map(a => a.ticker))];
  const tickers = [...new Set([...boardTickers, ...watchTickers, ...alertTickers, ...((paper.positions||[]).map(p => p.ticker))])];

  const quotes = await fetchQuotes(tickers);

  const fired = [];
  const nowIso = '2026-04-14T20:50:00Z';
  for (const a of alerts) {
    if (!a.active || !a.ticker || a.price == null) continue;
    const px = quotes[a.ticker];
    if (px == null) continue;
    if ((a.condition === 'above' && px >= a.price) || (a.condition === 'below' && px <= a.price)) {
      a.active = false;
      a.firedAt = nowIso;
      a.firedPrice = round2(px);
      a.action = `ALERT FIRED — ${a.ticker} ${a.condition} ${a.price} hit at ${round2(px)}.`;
      fired.push(`${a.ticker} ${a.condition} ${a.price} hit at ${round2(px)}`);
    }
  }

  for (const p of paper.positions || []) {
    const px = quotes[p.ticker];
    if (px == null) continue;
    p.currentPrice = round2(px);
    p.pnl = round2((px - Number(p.entryPrice)) * Number(p.shares));
    p.pnlPct = round2(((px - Number(p.entryPrice)) / Number(p.entryPrice)) * 100);
  }

  const quoteLine = ['IONQ','PLTR','RKLB','RXRX','SERV','TEM'].map(t => `${t} ${quotes[t] != null ? Number(quotes[t]).toFixed(2) : 'n/a'}`).join(' · ');
  const { html: nextHtml, count: zoneChanges } = reviseZones(html, quotes);
  html = nextHtml;

  const note = `4/14/26, 3:50 PM CT - All cash. No positions. Quote check: ${quoteLine}. Alerts fired: ${fired.length ? fired.join('; ') : 'none'}. Zone changes: ${zoneChanges}. No trades. Held cash.`;

  paper.lastUpdated = nowIso;
  paper.note = note;
  paper.grahamNote = note;
  paper.strategy.currentAssessment = note;
  for (const t of Object.keys(paper.watchlist || {})) {
    if (quotes[t] != null) paper.watchlist[t].price = round2(quotes[t]);
    paper.watchlist[t].note = note;
  }

  fs.writeFileSync(paperPath, JSON.stringify(paper, null, 2) + '\n');
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2) + '\n');
  fs.writeFileSync(boardPath, html);

  console.log(JSON.stringify({ note, fired, zoneChanges }, null, 2));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
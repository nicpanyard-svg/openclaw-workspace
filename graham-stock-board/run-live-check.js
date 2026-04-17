const fs = require('fs');
const path = require('path');

const portfolioPath = path.join(__dirname, 'paper-trades.json');
const alertsPath = path.join(__dirname, 'alerts.json');
const boardPath = path.join(__dirname, 'index.html');

const portfolio = JSON.parse(fs.readFileSync(portfolioPath, 'utf8'));
const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
let board = fs.readFileSync(boardPath, 'utf8');

function fmtMoney(n, digits = 2) {
  return `$${Number(n).toFixed(digits)}`;
}

function extractJsonArray(source, varName) {
  const marker = `const ${varName} = [`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find ${varName}`);
  const arrayStart = source.indexOf('[', start);
  let depth = 0;
  for (let i = arrayStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const raw = source.slice(arrayStart, i + 1);
        return { raw, start: arrayStart, end: i + 1, data: JSON.parse(raw) };
      }
    }
  }
  throw new Error(`Could not parse ${varName}`);
}

function replaceSlice(src, start, end, replacement) {
  return src.slice(0, start) + replacement + src.slice(end);
}

function parseRange(text) {
  if (!text) return null;
  const m = String(text).replace(/,/g, '').match(/\$?(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { low: Number(m[1]), high: Number(m[2]) };
}

function formatRange(low, high) {
  const dec = (Math.round(low * 100) % 100 !== 0 || Math.round(high * 100) % 100 !== 0) ? 2 : 0;
  return `$${low.toFixed(dec)}-${high.toFixed(dec)}`;
}

async function fetchPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${ticker} HTTP ${res.status}`);
  const data = await res.json();
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error(`No price for ${ticker}`);
  return meta.regularMarketPrice;
}

(async () => {
  const stocksBlock = extractJsonArray(board, 'stocks');
  const stocks = stocksBlock.data;
  const tickers = [...new Set([
    ...portfolio.positions.map(p => p.ticker),
    ...Object.keys(portfolio.watchlist || {}),
    ...stocks.map(s => s.ticker),
    ...alerts.map(a => a.ticker).filter(Boolean),
  ])];

  const prices = {};
  for (const ticker of tickers) {
    try {
      prices[ticker] = await fetchPrice(ticker);
    } catch (e) {
      prices[ticker] = null;
    }
  }

  const nowIso = '2026-04-07T15:20:00.000Z';
  const noteTime = '4/7/26, 10:20 AM CT';

  // Update positions
  let deployed = 0;
  let totalPnl = 0;
  for (const pos of portfolio.positions) {
    const px = prices[pos.ticker];
    if (typeof px === 'number') {
      pos.currentPrice = Number(px.toFixed(2));
      pos.pnl = Number(((px - pos.entryPrice) * pos.shares).toFixed(2));
      pos.pnlPct = Number((((px - pos.entryPrice) / pos.entryPrice) * 100).toFixed(2));
    }
    deployed += Number((pos.currentPrice * pos.shares).toFixed(2));
    totalPnl += pos.pnl || 0;
  }
  portfolio.deployed = Number(deployed.toFixed(2));
  portfolio.deployedPct = Number(((portfolio.deployed / portfolio.portfolioSize) * 100).toFixed(2));
  portfolio.portfolioValue = Number((portfolio.cash + portfolio.deployed).toFixed(2));
  portfolio.totalPnl = Number((portfolio.portfolioValue - portfolio.portfolioSize).toFixed(2));
  portfolio.totalPnlPct = Number((((portfolio.portfolioValue - portfolio.portfolioSize) / portfolio.portfolioSize) * 100).toFixed(2));

  // Update watchlist prices
  for (const [ticker, item] of Object.entries(portfolio.watchlist || {})) {
    const px = prices[ticker];
    if (typeof px === 'number') item.price = Number(px.toFixed(2));
  }

  // Alerts
  const firedAlerts = [];
  for (const alert of alerts) {
    if (!alert.active) continue;
    const px = prices[alert.ticker];
    if (typeof px !== 'number' || alert.price == null) continue;
    const hit = (alert.condition === 'above' && px >= alert.price) || (alert.condition === 'below' && px <= alert.price);
    if (hit) {
      alert.active = false;
      alert.firedAt = nowIso;
      alert.firedPrice = Number(px.toFixed(2));
      firedAlerts.push({ ticker: alert.ticker, condition: alert.condition, trigger: alert.price, price: Number(px.toFixed(2)), note: alert.note });
    }
  }

  // Zone validation + live price refresh on board stocks
  const zoneUpdates = [];
  for (const stock of stocks) {
    const px = prices[stock.ticker];
    if (typeof px === 'number') stock.price = fmtMoney(px, px >= 100 ? 2 : 2);
    const range = parseRange(stock.starterBuy);
    if (!range || typeof px !== 'number') continue;
    const belowFloor = px < range.low * 0.8;
    const aboveCeil = px > range.high * 1.2;
    if (!belowFloor && !aboveCeil) continue;
    const old = stock.starterBuy;
    const low = Number((px * 0.9).toFixed(px < 10 ? 2 : 2));
    const high = Number((px * 1.1).toFixed(px < 10 ? 2 : 2));
    stock.starterBuy = formatRange(low, high);
    zoneUpdates.push({ ticker: stock.ticker, from: old, to: stock.starterBuy, price: Number(px.toFixed(2)) });
  }

  const positionText = portfolio.positions.length
    ? `Updated ${portfolio.positions.length} open position(s); portfolio ${fmtMoney(portfolio.portfolioValue)}.`
    : 'All cash. No positions.';
  const alertText = firedAlerts.length ? ` Alerts: ${firedAlerts.map(a => `${a.ticker} ${a.condition} ${a.trigger} hit at ${a.price}`).join('; ')}.` : ' No alerts fired.';
  const zoneText = zoneUpdates.length ? ` Zone updates: ${zoneUpdates.map(z => `${z.ticker} ${z.from} → ${z.to}`).join('; ')}.` : ' Starter zones still valid after live drift check.';
  const finalNote = `${noteTime} - ${positionText}${alertText}${zoneText} No trades made.`;

  portfolio.lastUpdated = nowIso;
  portfolio.note = finalNote;
  portfolio.grahamNote = finalNote;
  if (portfolio.strategy) portfolio.strategy.currentAssessment = finalNote;

  board = replaceSlice(board, stocksBlock.start, stocksBlock.end, JSON.stringify(stocks, null, 2));

  fs.writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2) + '\n');
  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2) + '\n');
  fs.writeFileSync(boardPath, board);

  console.log(JSON.stringify({
    prices,
    firedAlerts,
    zoneUpdates,
    portfolioValue: portfolio.portfolioValue,
    note: finalNote,
    madeTrade: false,
    urgent: false
  }, null, 2));
})();

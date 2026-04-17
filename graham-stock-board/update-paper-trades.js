const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'paper-trades.json');
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

const quotes = {
  PLTR: { price: 146.6, prevClose: 147.93, dayHigh: 148.0, dayLow: 144.45 },
  TEM: { price: 45.7, prevClose: 47.3, dayHigh: 46.74, dayLow: 45.32 },
  RKLB: { price: 64.97, prevClose: 67.67, dayHigh: 68.3, dayLow: 64.12 },
  IONQ: { price: 27.51, prevClose: 29.24, dayHigh: 28.88, dayLow: 27.29 },
  SERV: { price: 7.849, prevClose: 8.35, dayHigh: 8.29, dayLow: 7.8 },
  RXRX: { price: 3.07, prevClose: 3.15, dayHigh: 3.13, dayLow: 3.04 },
};

for (const [ticker, q] of Object.entries(quotes)) {
  if (!data.watchlist[ticker]) continue;
  data.watchlist[ticker].price = q.price;
  data.watchlist[ticker].chgPct = Number((((q.price - q.prevClose) / q.prevClose) * 100).toFixed(2));
  data.watchlist[ticker].dayHigh = q.dayHigh;
  data.watchlist[ticker].dayLow = q.dayLow;
  data.watchlist[ticker].prevClose = q.prevClose;
}

const summary = '4/7/26, 10:10 AM CT - All cash. No positions. No alerts fired. Starter zones still valid after live drift check. No trades made.';
data.lastUpdated = '2026-04-07T15:10:00.000Z';
data.note = summary;
data.grahamNote = summary;
data.strategy.currentAssessment = summary;

fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
console.log('paper-trades.json updated');

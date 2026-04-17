const fs = require('fs');
const raw = fs.readFileSync('C:/Users/IkeFl/.openclaw/workspace/graham-stock-board/paper-trades.json', 'utf8');

// Fix encoding issues before parsing
const fixed = raw.replace(/â€"/g, '—').replace(/â€˜/g, "'").replace(/â€™/g, "'");

const data = JSON.parse(fixed);

data.lastUpdated = '2026-03-30T16:10:00.000Z';

data.watchlist = {
  PLTR: {
    price: 141.565, chgPct: -1.05, dayHigh: 144.12, dayLow: 140.05, prevClose: 143.06, volume: 15900672,
    note: '11:10 AM CT 3/30/26. $141.565 (-1.05%). $140 watch intact — $1.57 above trigger. No $148 re-entry.'
  },
  TEM: {
    price: 42.98, chgPct: 0.84, dayHigh: 43.17, dayLow: 41.812, prevClose: 42.62, volume: 1954820,
    note: '11:10 AM CT 3/30/26. $42.98 (+0.84%). Nudging toward $43 zone. Last probe $43.17 rejected. Need confirmed hold + volume before starter.'
  },
  RKLB: {
    price: 58.695, chgPct: -3.67, dayHigh: 61.64, dayLow: 57.91, prevClose: 60.93, volume: 9835231,
    note: '11:10 AM CT 3/30/26. $58.695 (-3.67%). Bounce off $57.91 low — $57 alert not fired. Need $60 reclaim for entry.'
  },
  IONQ: {
    price: 27.22, chgPct: -1.05, dayHigh: 28.16, dayLow: 26.71, prevClose: 27.51, volume: 8586078,
    note: '11:10 AM CT 3/30/26. $27.22 (-1.05%). Small bounce off $26.71 day low. No $30 reclaim — no action.'
  },
  SERV: {
    price: 8.045, chgPct: -3.31, dayHigh: 8.50, dayLow: 7.93, prevClose: 8.32, volume: 2122174,
    note: '11:10 AM CT 3/30/26. $8.045 (-3.31%). Soft. No entry signal.'
  },
  RXRX: {
    price: 2.87, chgPct: -2.38, dayHigh: 2.935, dayLow: 2.80, prevClose: 2.94, volume: 8699046,
    note: '11:10 AM CT 3/30/26. $2.87 (-2.38%). Slight bounce off $2.80. No entry signal.'
  }
};

data.strategy.currentAssessment = '11:10 AM CT 3/30/26 - SLIGHT STABILIZATION. Names slightly off lows, no conviction. TEM $42.98 nudging $43 zone. PLTR $141.565, $140 watch intact. RKLB $58.695 holding $57 support. IONQ $27.22 bounced. 100% cash correct.';
data.grahamNote = '11:10 AM CT 3/30/26 - 100% cash $9,987.81. NO TRADE. TEM $42.98 nudging $43 zone (last probe $43.17 rejected — need hold). PLTR $141.565 holding $140. RKLB $58.695 bounced from $57.91 day low. IONQ $27.22. No alerts fired. No zone breaches. Sitting tight.';

fs.writeFileSync('C:/Users/IkeFl/.openclaw/workspace/graham-stock-board/paper-trades.json', JSON.stringify(data, null, 4));
console.log('DONE');

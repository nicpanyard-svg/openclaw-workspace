const fs = require('fs');

const filePath = 'C:/Users/IkeFl/.openclaw/workspace/graham-stock-board/paper-trades.json';
const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
const data = JSON.parse(raw);

// 10:16 AM CT prices
data.watchlist.PLTR.price = 141.42;
data.watchlist.PLTR.chgPct = -1.28;
data.watchlist.PLTR.dayHigh = 144.12;
data.watchlist.PLTR.dayLow = 140.05;
data.watchlist.PLTR.prevClose = 143.06;
data.watchlist.PLTR.volume = 12481852;
data.watchlist.PLTR.note = '10:16 AM CT 3/30/26. $141.42 (-1.28%). Day low $140.05 intact — floor holding. Slight uptick from $141.21 at 10:10. No entry — need $148 reclaim.';

data.watchlist.RKLB.price = 58.75;
data.watchlist.RKLB.chgPct = -3.58;
data.watchlist.RKLB.dayHigh = 61.64;
data.watchlist.RKLB.dayLow = 57.91;
data.watchlist.RKLB.prevClose = 60.93;
data.watchlist.RKLB.volume = 8231857;
data.watchlist.RKLB.note = '10:16 AM CT 3/30/26. $58.75 (-3.58%). Tiny bounce from $58.63. $57 stop-watch zone intact. $60 trigger $1.25 away. No entry.';

data.watchlist.IONQ.price = 27.17;
data.watchlist.IONQ.chgPct = -1.24;
data.watchlist.IONQ.dayHigh = 28.16;
data.watchlist.IONQ.dayLow = 26.71;
data.watchlist.IONQ.prevClose = 27.51;
data.watchlist.IONQ.volume = 7429306;
data.watchlist.IONQ.note = '10:16 AM CT 3/30/26. $27.17 (-1.24%). Slight bounce off day low $26.71. $30 re-entry trigger $2.83 away. No action.';

data.watchlist.TEM.price = 42.435;
data.watchlist.TEM.chgPct = -0.43;
data.watchlist.TEM.dayHigh = 42.83;
data.watchlist.TEM.dayLow = 41.812;
data.watchlist.TEM.prevClose = 42.62;
data.watchlist.TEM.volume = 1534056;
data.watchlist.TEM.note = '10:16 AM CT 3/30/26. $42.44 (-0.43%). Uptick. Starter zone $43-49 — $0.56 from lower trigger. Getting closer. Watching.';

data.watchlist.SERV.price = 8.05;
data.watchlist.SERV.chgPct = -3.25;
data.watchlist.SERV.dayHigh = 8.50;
data.watchlist.SERV.dayLow = 7.93;
data.watchlist.SERV.prevClose = 8.32;
data.watchlist.SERV.volume = 1847105;
data.watchlist.SERV.note = '10:16 AM CT 3/30/26. $8.05 (-3.25%). Flat from 10:10. Not engaging.';

data.watchlist.RXRX.price = 2.835;
data.watchlist.RXRX.chgPct = -3.57;
data.watchlist.RXRX.dayHigh = 2.935;
data.watchlist.RXRX.dayLow = 2.80;
data.watchlist.RXRX.prevClose = 2.94;
data.watchlist.RXRX.volume = 7107484;
data.watchlist.RXRX.note = '10:16 AM CT 3/30/26. $2.835 (-3.57%). Flat. Not engaging.';

data.lastUpdated = '2026-03-30T15:16:00.000Z';
data.date = '2026-03-30';
data.note = '10:16 AM CT 3/30/26 — 100% CASH $9,987.81. No trades. Minor positive drift across watchlist vs 10:10. PLTR $141.42 — $140.05 floor intact. RKLB $58.75 — $60 trigger $1.25 away. TEM $42.44 — $0.56 from $43 starter zone. No entries triggered. Cash preserved.';
data.grahamNote = '10:16 AM CT 3/30/26 — 100% cash $9,987.81. Minor recovery drift. PLTR $140 floor holds. RKLB approaching $60. TEM $0.56 from $43 starter. No entries. Watching.';
data.strategy.currentAssessment = '10:16 AM CT 3/30/26 — Minor positive drift from 10:10. PLTR $140.05 floor intact. RKLB $58.75, $1.25 from $60 trigger. TEM $42.44, $0.56 from $43 starter zone. No entries triggered. Cash is the position.';

fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
console.log('paper-trades.json updated at 10:16 AM CT');

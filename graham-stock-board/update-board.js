const fs = require('fs');

const tradesPath = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\graham-stock-board\\paper-trades.json';
const data = JSON.parse(fs.readFileSync(tradesPath, 'utf8'));

const prices = {
  PLTR: { price: 146.52, prevClose: 137.55, high: 147.86, low: 138.98, volume: 30932177 },
  IONQ: { price: 28.71, prevClose: 26.59, high: 28.97, low: 27.055, volume: 14864011 },
  RKLB: { price: 63.98, prevClose: 57.38, high: 64.58, low: 59.03, volume: 19292303 },
  TEM:  { price: 45.47, prevClose: 42.37, high: 45.50, low: 43.00, volume: 2914876 },
  SERV: { price: 8.29,  prevClose: 7.73,  high: 8.40,  low: 7.99,  volume: 3654711 },
  RXRX: { price: 3.055, prevClose: 2.84,  high: 3.07,  low: 2.90,  volume: 9493211 }
};

const chg = (t) => {
  const p = prices[t];
  return ((p.price - p.prevClose) / p.prevClose * 100).toFixed(2);
};

// Update watchlist
data.watchlist.PLTR = {
  price: 146.52,
  chgPct: parseFloat(chg('PLTR')),
  dayHigh: 147.86,
  dayLow: 138.98,
  prevClose: 137.55,
  volume: 30932177,
  note: `INTRADAY 3/31/26 1:27PM CT. $146.52 (+${chg('PLTR')}%). Q1 END WINDOW DRESSING. Day range $138.98-$147.86. Vol 30.9M. RE-ENTRY TRIGGER $148 NOT YET HIT — $1.48 away. Bounce is real but today is Q1 end = institutional book-dressing. Wait for April 1 open. If PLTR opens green above $148 tomorrow = starter 2 shares. Today: hands off.`
};

data.watchlist.IONQ = {
  price: 28.71,
  chgPct: parseFloat(chg('IONQ')),
  dayHigh: 28.97,
  dayLow: 27.055,
  prevClose: 26.59,
  volume: 14864011,
  note: `INTRADAY 3/31/26 1:27PM CT. $28.71 (+${chg('IONQ')}%). Q1 END BOUNCE. Day range $27.055-$28.97. Vol 14.9M. RE-ENTRY TRIGGER $30 NOT HIT — $1.29 away. Back above $28 but needs $30 reclaim with conviction. Q1 end = suspect. Watch April 1.`
};

data.watchlist.RKLB = {
  price: 63.98,
  chgPct: parseFloat(chg('RKLB')),
  dayHigh: 64.58,
  dayLow: 59.03,
  prevClose: 57.38,
  volume: 19292303,
  note: `INTRADAY 3/31/26 1:27PM CT. $63.98 (+${chg('RKLB')}%). ⚡ $60 ALERT FIRED — RKLB reclaimed $60 zone, now at $63.98. Day range $59.03-$64.58. Vol 19.3M. Q1 end window dressing caution — +11.5% in one day is suspect. No entry today. Watch April 1 open. If holds $60-63 and opens green tomorrow = 1-share starter consideration. Stop $57.`
};

data.watchlist.TEM = {
  price: 45.47,
  chgPct: parseFloat(chg('TEM')),
  dayHigh: 45.50,
  dayLow: 43.00,
  prevClose: 42.37,
  volume: 2914876,
  note: `INTRADAY 3/31/26 1:27PM CT. $45.47 (+${chg('TEM')}%). IN STARTER ZONE $43-49. Day range $43.00-$45.50. Vol 2.9M (light). Q1 end bounce. Volume is lightest of the group — less conviction. Best setup fundamentally but today's move = window dressing. Wait for April 1 with volume confirmation.`
};

data.watchlist.SERV = {
  price: 8.29,
  chgPct: parseFloat(chg('SERV')),
  dayHigh: 8.40,
  dayLow: 7.99,
  prevClose: 7.73,
  volume: 3654711,
  note: `INTRADAY 3/31/26 1:27PM CT. $8.29 (+${chg('SERV')}%). In zone $7-9. Day range $7.99-$8.40. Q1 end bounce. Still cautious — needs cleaner tape.`
};

data.watchlist.RXRX = {
  price: 3.055,
  chgPct: parseFloat(chg('RXRX')),
  dayHigh: 3.07,
  dayLow: 2.90,
  prevClose: 2.84,
  volume: 9493211,
  note: `INTRADAY 3/31/26 1:27PM CT. $3.055 (+${chg('RXRX')}%). In zone $2.50-3.50. Day range $2.90-$3.07. Q1 end bounce. No entry — still weak tape overall.`
};

// Update note and date
data.date = '2026-03-31';
data.lastUpdated = '2026-03-31T18:27:00.000Z';
data.note = 'INTRADAY 3/31/26 1:27PM CT — Q1 END WINDOW DRESSING BOUNCE. All names up 7-11%. RKLB $60 alert fired ($63.98). PLTR $146.52 — $148 trigger $1.48 away. IONQ $28.71 — $30 trigger $1.29 away. NO TRADES — Q1 end bounces are institution book-dressing, not real momentum. 100% cash preserved. Strategy: watch April 1 open for confirmation. If names open green and hold with volume — engage. If they gap and fade, stay cash.';
data.grahamNote = 'INTRADAY 3/31/26 1:27PM CT — Q1 END. All watchlist names up big (RKLB +11.5%, IONQ +8%, TEM +7.3%, PLTR +6.5%). This is classic window dressing — fund managers buying winners before Q1 books close. Not a conviction rally until April 1 confirms. RKLB $60 reclaim alert fired. PLTR $1.48 from re-entry. Holding 100% cash. Patience is the trade today.';
data.strategy.currentAssessment = 'INTRADAY 3/31/26 1:27PM CT — Q1 end rally. 100% cash $9,987.81. All names bouncing hard but this is institutional window dressing on the last day of the quarter. No entries today. April 1 open = real test. Watch for: PLTR $148+ open, IONQ $30+ reclaim, RKLB holding $60-63. TEM $43-49 with volume = best setup for April entry.';

// Update passed entries to reflect current prices
data.passed = data.passed.map(p => {
  if (p.ticker === 'PLTR') return { ...p, reason: `STOPPED OUT 2026-03-27 at $142.10. PLTR $146.52 (+6.5%) at 1:27PM CT 3/31/26. Q1 END RALLY. $148 re-entry trigger $1.48 away. Watch April 1 open.` };
  if (p.ticker === 'IONQ') return { ...p, reason: `STOPPED OUT 2026-03-26 at $31.00. IONQ $28.71 (+8.0%) at 1:27PM CT 3/31/26. Q1 bounce. $30 re-entry trigger $1.29 away. Watch April 1.` };
  if (p.ticker === 'RKLB') return { ...p, reason: `EXITED 2026-03-25 at $73.92. ⚡ RKLB $63.98 (+11.5%) at 1:27PM CT 3/31/26. $60 ALERT FIRED. Q1 end bounce — no entry today. Watch April 1 open. Stop $57 on any entry.` };
  return p;
});

fs.writeFileSync(tradesPath, JSON.stringify(data, null, 4));
console.log('Updated paper-trades.json');
console.log('RKLB alert fired: $63.98 — $60 reclaim confirmed');
console.log('PLTR: $146.52 — $1.48 from re-entry trigger');
console.log('IONQ: $28.71 — $1.29 from re-entry trigger');
console.log('No trades — Q1 end window dressing, hold cash');

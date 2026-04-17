const fs = require('fs');
const raw = fs.readFileSync('C:/Users/IkeFl/.openclaw/workspace/graham-stock-board/paper-trades.json', 'utf8');

// The currentAssessment field is corrupted - it has an embedded key inside the string value
// We need to find the start of "currentAssessment" and replace with a clean value
const startKey = '"currentAssessment"';
const startIdx = raw.indexOf(startKey);

if (startIdx === -1) {
  console.log('No currentAssessment found');
  process.exit(1);
}

// Find the start of the value (after the colon and whitespace/quote)
const valueStart = raw.indexOf('"', startIdx + startKey.length + 1); // skip `:  "`

// We need to find where this string actually ends - look for the closing `}` of strategy
// The field is last in strategy, so ends before `\n                 }`
// Let's find the next `"` key after this mess - looking for `"grahamNote"`
const nextKey = '"grahamNote"';
const nextKeyIdx = raw.indexOf(nextKey);

if (nextKeyIdx === -1) {
  console.log('Cannot find grahamNote');
  process.exit(1);
}

// The corrupted value runs from valueStart to somewhere before nextKeyIdx
// Find the last `"` before nextKeyIdx that closes the strategy object
// Strategy closes at `}` before grahamNote - find it
// Pattern: the value ends at `"\n                 },\n    "grahamNote"`
// Let's just replace the entire currentAssessment value

const newAssessment = '1:40 PM CT 3/27/26 - 100% CASH. Tape dead. PLTR/IONQ fading, RKLB holding $60, TEM +$0.22 (minor strength). Same-day rule PLTR. 80 min to close. No entries. Monday: PLTR $148 reclaim, IONQ $30+ hold, RKLB $60 volume close.';

// Find everything between currentAssessment's value start quote and the closing of strategy block
// Reconstruct: before currentAssessment ... + new clean value + ... rest from grahamNote
const beforeCA = raw.substring(0, startIdx);
const afterGrahamNote = raw.substring(nextKeyIdx);

const cleanMiddle = `${startKey}:  "${newAssessment}"\n                 },\n    `;

const rebuilt = beforeCA + cleanMiddle + afterGrahamNote;

try {
  const parsed = JSON.parse(rebuilt);
  console.log('Parse OK - writing...');
  
  // Now update the fields we want
  parsed.lastUpdated = '2026-03-27T18:40:00.000Z';
  parsed.note = '1:40 PM CT 3/27/26 - 100% CASH. Bear tape persists. PLTR fading -$0.14, IONQ -$0.07, RKLB flat (holding $60), TEM +$0.22 (best move in group). No alerts fired. No open positions. Same-day rule PLTR. 80 min to close. Monday setups hold.';
  parsed.grahamNote = '1:40 PM CT 3/27/26 - PLTR $143.24 (-2.93%), IONQ $27.82 (-6.78%), RKLB $61.16 (-7.26%), TEM $42.66 (-6.31%), SERV $8.39 (-7.61%), RXRX $2.94 (-6.83%). 100% cash $9,987.81. TEM showing relative strength (+0.22 in 5 min). RKLB holding $60 key. Bear tape intact. No trades.';
  
  parsed.watchlist.PLTR.price = 143.235;
  parsed.watchlist.PLTR.chgPct = -2.93;
  parsed.watchlist.PLTR.volume = 25672601;
  parsed.watchlist.PLTR.note = '1:40 PM CT 3/27/26. $143.24 (-2.93%). Faded -$0.14 vs 1:35. Drifting toward $140 watch. Same-day rule ACTIVE. No action.';

  parsed.watchlist.IONQ.price = 27.817;
  parsed.watchlist.IONQ.chgPct = -6.78;
  parsed.watchlist.IONQ.volume = 12201818;
  parsed.watchlist.IONQ.note = '1:40 PM CT 3/27/26. $27.82 (-6.78%). Faded -$0.07 vs 1:35. Below starterBuy zone $28-34. No entry. Monday: $30+ hold needed.';

  parsed.watchlist.RKLB.price = 61.155;
  parsed.watchlist.RKLB.chgPct = -7.26;
  parsed.watchlist.RKLB.volume = 15893374;
  parsed.watchlist.RKLB.note = '1:40 PM CT 3/27/26. $61.16 (-7.26%). Holding above $60 key level. Zone $60-63 bottom. Monday: $60 hold on close critical.';

  parsed.watchlist.TEM.price = 42.655;
  parsed.watchlist.TEM.chgPct = -6.31;
  parsed.watchlist.TEM.volume = 3996008;
  parsed.watchlist.TEM.note = '1:40 PM CT 3/27/26. $42.66 (-6.31%). +$0.22 vs 1:35 — strongest move in group. Still below starterBuy zone $43-49. No entry.';

  parsed.watchlist.SERV.price = 8.389;
  parsed.watchlist.SERV.chgPct = -7.61;
  parsed.watchlist.SERV.volume = 2481563;
  parsed.watchlist.SERV.note = '1:40 PM CT 3/27/26. $8.39 (-7.61%). Flat vs 1:35. In starterBuy zone $7-9. Not engaging in bear tape.';

  parsed.watchlist.RXRX.price = 2.935;
  parsed.watchlist.RXRX.chgPct = -6.83;
  parsed.watchlist.RXRX.volume = 14347307;
  parsed.watchlist.RXRX.note = '1:40 PM CT 3/27/26. $2.935 (-6.83%). Flat vs 1:35. In starterBuy zone $2.50-3.50. Not engaging.';

  parsed.strategy.currentAssessment = '1:40 PM CT 3/27/26 - 100% CASH. Tape dead. PLTR/IONQ fading, RKLB holding $60, TEM +$0.22 (minor strength). Same-day rule PLTR. 80 min to close. No entries. Monday: PLTR $148 reclaim, IONQ $30+ hold, RKLB $60 volume close.';

  fs.writeFileSync('C:/Users/IkeFl/.openclaw/workspace/graham-stock-board/paper-trades.json', JSON.stringify(parsed, null, 4), 'utf8');
  console.log('Written successfully.');
} catch(e) {
  console.log('Error:', e.message.substring(0, 300));
  // Debug: find where it fails
  const m = e.message.match(/position (\d+)/);
  if (m) {
    const p = parseInt(m[1]);
    console.log('Context around error:', rebuilt.substring(Math.max(0,p-100), p+100));
  }
}

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const boardPath = path.join(process.cwd(), 'graham-stock-board', 'index.html');
const syncScript = path.join(process.cwd(), 'sync-stock-board.js');
let html = fs.readFileSync(boardPath, 'utf8');

const targets = {
  FLNC: { price: 3.06, old: '$12-15 (not yet)', next: '$2.75-$3.4 (zone revised 4/14/26)' },
  HIMS: { price: 9.83, old: '$20.31-$22.45', next: '$8.85-$10.8 (zone revised 4/14/26)' },
  BBAI: { price: 0.54, old: '$3.25-4.00', next: '$0.49-$0.59 (zone revised 4/14/26)' },
  NXT: { price: 15.69, old: '$95-120', next: '$14.1-$17.3 (zone revised 4/14/26)' },
  SOFI: { price: 6.52, old: '$14-17', next: '$5.87-$7.17 (zone revised 4/14/26)' },
  COIN: { price: 79.58, old: '$150-175 (zone revised 3/30/26 â€” stock at $160.69, 34% below prior $220-250 zone; reset to current range)', next: '$71.6-$87.5 (zone revised 4/14/26)' },
  RIVN: { price: 4.97, old: '$14-17', next: '$4.47-$5.47 (zone revised 4/14/26)' },
  SNOW: { price: 54.46, old: '$132.76-162.27', next: '$49-$59.9 (zone revised 4/14/26)' },
  DDOG: { price: 22.58, old: '$115-130', next: '$20.3-$24.8 (zone revised 4/14/26)' },
  GTLB: { price: 22.98, old: '$20-25', next: '$20-$25' },
  MELI: { price: 784.07, old: '$1536-1878', next: '$706-$862 (zone revised 4/14/26)' },
  NU: { price: 4.53, old: '$14.52-$16.04', next: '$4.08-$4.98 (zone revised 4/14/26)' }
};

let changes = [];
for (const [ticker, spec] of Object.entries(targets)) {
  if (spec.next === spec.old) continue;
  const oldText = `"ticker": "${ticker}"`;
  const idx = html.indexOf(oldText);
  if (idx === -1) continue;
  const slice = html.slice(idx, idx + 800);
  const oldStarter = `"starterBuy": "${spec.old}"`;
  if (slice.includes(oldStarter)) {
    html = html.replace(oldStarter, `"starterBuy": "${spec.next}"`);
    changes.push(`${ticker}: ${spec.old} -> ${spec.next}`);
  }
}

fs.writeFileSync(boardPath, html);
cp.execFileSync('node', [syncScript], { cwd: process.cwd(), stdio: 'inherit' });
console.log(JSON.stringify(changes, null, 2));

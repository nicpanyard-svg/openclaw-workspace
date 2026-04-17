// Zone analysis + alert check
const prices = {
  PLTR: { price: 148.46, prevClose: 146.49, dayHigh: 148.51, dayLow: 140.51, volume: 29769085, chgPct: 1.34 },
  IONQ: { price: 29.30, prevClose: 27.79, dayHigh: 29.485, dayLow: 26.74, volume: 15395347, chgPct: 5.43 },
  RKLB: { price: 67.73, prevClose: 65.52, dayHigh: 69.39, dayLow: 61.87, volume: 32052068, chgPct: 3.37 },
  TEM: { price: 47.39, prevClose: 47.03, dayHigh: 48.10, dayLow: 44.13, volume: 3717065, chgPct: 0.77 },
  SERV: { price: 8.45, prevClose: 8.41, dayHigh: 8.64, dayLow: 7.97, volume: 2221604, chgPct: 0.48 },
  RXRX: { price: 3.11, prevClose: 3.06, dayHigh: 3.13, dayLow: 2.93, volume: 9243237, chgPct: 1.63 }
};

// Starter buy zones (parsed from index.html)
const zones = {
  IONQ: { low: 28, high: 34 },
  RKLB: { low: 60, high: 63 },
  PLTR: { low: 148, high: 153 }, // re-entry zone
  TEM: { low: 43, high: 49 },
  SERV: { low: 7.00, high: 9.00 },
  RXRX: { low: 2.50, high: 3.50 }
};

console.log('\n=== ZONE VALIDATION (>20% outside zone = flag) ===');
Object.keys(zones).forEach(t => {
  const p = prices[t].price;
  const z = zones[t];
  let status = 'OK';
  if (p < z.low) {
    const pct = ((z.low - p) / z.low * 100).toFixed(1);
    status = pct > 20 ? `BELOW ZONE by ${pct}% ⚠️` : `Below zone by ${pct}%`;
  } else if (p > z.high) {
    const pct = ((p - z.high) / z.high * 100).toFixed(1);
    status = pct > 20 ? `ABOVE ZONE by ${pct}% ⚠️` : `Above zone by ${pct}%`;
  }
  console.log(`${t}: $${p} | Zone $${z.low}-$${z.high} | ${status}`);
});

console.log('\n=== ACTIVE ALERTS CHECK ===');
// IONQ above $30 re-entry
if (prices.IONQ.price > 30) console.log('🚨 IONQ ABOVE $30 RE-ENTRY ALERT TRIGGERED');
else console.log(`IONQ $30 re-entry: NOT triggered ($${prices.IONQ.price})`);

// IONQ above $35.73
if (prices.IONQ.price > 35.73) console.log('🚨 IONQ ABOVE $35.73 INSIDER ZONE TOP');
else console.log(`IONQ $35.73 insider top: NOT triggered`);

// IONQ below $25
if (prices.IONQ.price < 25) console.log('🚨 IONQ BELOW $25 SUPPORT WATCH');

// PLTR above $148 re-entry
if (prices.PLTR.price > 148) console.log(`⚠️ PLTR $148 re-entry alert: Price $${prices.PLTR.price} — AT/ABOVE trigger but no base formed, stalled at $148.50`);
else console.log(`PLTR $148 re-entry: below trigger`);

// RKLB above $60 reclaim
if (prices.RKLB.price > 60) console.log(`ℹ️ RKLB $60 reclaim: YES ($${prices.RKLB.price}) — but rejected at $69.39 insider resistance. No entry.`);

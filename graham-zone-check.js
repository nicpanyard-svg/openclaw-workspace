// Zone validation: check if current price is more than 20% outside starterBuy zone
const prices = { PLTR: 147.56, IONQ: 29.85, RKLB: 65.94, TEM: 45.53 };
const zones = {
  PLTR: { low: 135, high: 155 },   // starterBuy $135-155
  IONQ: { low: 28, high: 34 },     // starterBuy $28-34
  RKLB: { low: 65, high: 70 },     // starterBuy $65-70 (re-entry zone)
  TEM:  { low: 43, high: 49 },     // starterBuy $43-49
};

for (const [ticker, price] of Object.entries(prices)) {
  const z = zones[ticker];
  if (!z) continue;
  const midpoint = (z.low + z.high) / 2;
  const distFromLow = ((price - z.low) / z.low * 100).toFixed(1);
  const distFromHigh = ((price - z.high) / z.high * 100).toFixed(1);
  
  let status = 'IN ZONE';
  if (price < z.low) {
    const pctBelow = ((z.low - price) / z.low * 100).toFixed(1);
    status = pctBelow > 20 ? `⚠️ ${pctBelow}% BELOW ZONE (>20% violation)` : `${pctBelow}% below zone`;
  } else if (price > z.high) {
    const pctAbove = ((price - z.high) / z.high * 100).toFixed(1);
    status = pctAbove > 20 ? `⚠️ ${pctAbove}% ABOVE ZONE (>20% violation)` : `${pctAbove}% above zone`;
  }
  
  console.log(`${ticker}: $${price} | Zone $${z.low}-$${z.high} | ${status}`);
}

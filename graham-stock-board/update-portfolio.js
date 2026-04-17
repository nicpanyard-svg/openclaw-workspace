const fs = require('fs');
const path = require('path');

const portfolioFile = path.join(__dirname, 'paper-trades.json');
const portfolio = JSON.parse(fs.readFileSync(portfolioFile, 'utf8'));

// Current prices from fetch
const prices = {
  PLTR: { price: 151.075, chgPct: -2.51 },
  TEM:  { price: 46.35,   chgPct: -0.88 },
  RKLB: { price: 69.00,   chgPct: -5.32 },
  IONQ: { price: 31.11,   chgPct: -2.66 }
};

const now = new Date().toISOString();
const timeLabel = "11:06 AM CT 3/26/26";

// Update open positions
portfolio.positions.forEach(pos => {
  const q = prices[pos.ticker];
  if (!q) return;
  pos.currentPrice = q.price;
  pos.marketValue = parseFloat((pos.shares * q.price).toFixed(2));
  pos.unrealizedPnl = parseFloat((pos.marketValue - pos.totalCost).toFixed(2));
  pos.unrealizedPnlPct = parseFloat(((pos.unrealizedPnl / pos.totalCost) * 100).toFixed(2));
  pos.note = `${timeLabel}. $${q.price} (${q.chgPct}% day). Holding ${pos.shares} shares, avg entry $${pos.avgEntry}. ${pos.unrealizedPnl >= 0 ? '+' : ''}$${pos.unrealizedPnl} unrealized (${pos.unrealizedPnlPct >= 0 ? '+' : ''}${pos.unrealizedPnlPct}%). Stop $${pos.stopLoss} intact — ${(((q.price - pos.stopLoss)/q.price)*100).toFixed(2)}% away. Zone $148-153 holding. Tape softening — RKLB ${prices.RKLB.chgPct}% IONQ ${prices.IONQ.chgPct}%. Next target: $${pos.target}.`;
});

// Recalculate deployed / portfolio value
const totalDeployed = portfolio.positions.reduce((s, p) => s + p.marketValue, 0);
portfolio.deployed = parseFloat(totalDeployed.toFixed(2));
portfolio.deployedPct = parseFloat(((totalDeployed / portfolio.portfolioSize) * 100).toFixed(2));
portfolio.portfolioValue = parseFloat((portfolio.cash + totalDeployed).toFixed(2));
portfolio.totalPnl = parseFloat((portfolio.portfolioValue - portfolio.portfolioSize).toFixed(2));
portfolio.totalPnlPct = parseFloat(((portfolio.totalPnl / portfolio.portfolioSize) * 100).toFixed(2));
portfolio.lastUpdated = now;

// Update watchlist
const pltrPos = portfolio.positions.find(p => p.ticker === 'PLTR');
portfolio.watchlist.PLTR = {
  price: prices.PLTR.price,
  chgPct: prices.PLTR.chgPct,
  note: `${timeLabel}. $${prices.PLTR.price} (${prices.PLTR.chgPct}%) — IN POSITION (4 shares). ${pltrPos ? (pltrPos.unrealizedPnl >= 0 ? '+' : '') + '$' + pltrPos.unrealizedPnl + ' unrealized (' + (pltrPos.unrealizedPnlPct >= 0 ? '+' : '') + pltrPos.unrealizedPnlPct + '%)' : ''}. Avg entry $149.79. Stop $144 (${(((prices.PLTR.price - 144)/prices.PLTR.price)*100).toFixed(2)}% away). Tape soft but zone holding. Next: $153-155 breakout add.`
};
portfolio.watchlist.TEM = {
  price: prices.TEM.price,
  chgPct: prices.TEM.chgPct,
  note: `${timeLabel}. $${prices.TEM.price} (${prices.TEM.chgPct}%) — still strongest name on board. PLTR ${prices.PLTR.chgPct}%, RKLB ${prices.RKLB.chgPct}%, IONQ ${prices.IONQ.chgPct}%. TEM holding relative strength. Zone $43-49. Best candidate for next buy when tape stabilizes.`
};
portfolio.watchlist.RKLB = {
  price: prices.RKLB.price,
  chgPct: prices.RKLB.chgPct,
  note: `${timeLabel}. $${prices.RKLB.price} (${prices.RKLB.chgPct}%) — $2.00 above $67 alert level. Re-entry zone $65-67. Tape still weak. Not entering without clear reversal candle and volume.`
};
portfolio.watchlist.IONQ = {
  price: prices.IONQ.price,
  chgPct: prices.IONQ.chgPct,
  note: `${timeLabel}. $${prices.IONQ.price} (${prices.IONQ.chgPct}%). Re-entry zone $28-29, still $2.11 above zone. No action. Stopped out at $31.00 — not chasing back in.`
};

// Update strategy assessment
portfolio.strategy.currentAssessment = `${timeLabel}. HOLD — No trades. PLTR $${prices.PLTR.price} (${prices.PLTR.chgPct}%), ${pltrPos ? (pltrPos.unrealizedPnl >= 0 ? '+' : '') + '$' + pltrPos.unrealizedPnl + ' unrealized (' + (pltrPos.unrealizedPnlPct >= 0 ? '+' : '') + pltrPos.unrealizedPnlPct + '%)' : ''} on 4 shares. TEM $${prices.TEM.price} (${prices.TEM.chgPct}%) still strongest name on board. RKLB $${prices.RKLB.price} (${prices.RKLB.chgPct}%) — $2.00 above re-entry zone. IONQ $${prices.IONQ.price} (${prices.IONQ.chgPct}%) — $2.11 above re-entry. ${portfolio.deployedPct}% deployed, ${(100-portfolio.deployedPct).toFixed(2)}% cash. Capital well-protected.`;

portfolio.grahamNote = `${timeLabel}. HOLD. PLTR $${prices.PLTR.price} (${prices.PLTR.chgPct}%) — 4 shares, avg entry $149.79. ${pltrPos ? (pltrPos.unrealizedPnl >= 0 ? '+' : '') + '$' + pltrPos.unrealizedPnl + ' unrealized' : ''}. Stop $144 still ${(((prices.PLTR.price - 144)/prices.PLTR.price)*100).toFixed(2)}% away, well intact. TEM $${prices.TEM.price} (${prices.TEM.chgPct}%) continues to outperform — best relative-strength name. RKLB at $${prices.RKLB.price} (${prices.RKLB.chgPct}%) still $2 above my $67 re-entry line — not touching it. IONQ $${prices.IONQ.price} (${prices.IONQ.chgPct}%) needs to come back to $29 before I'd reconsider. Broad tape soft, no urgency to deploy. ${portfolio.deployedPct}% deployed. Watching.`;

fs.writeFileSync(portfolioFile, JSON.stringify(portfolio, null, 2));
console.log(JSON.stringify({
  status: 'updated',
  pltr: { price: prices.PLTR.price, chgPct: prices.PLTR.chgPct, unrealizedPnl: pltrPos ? pltrPos.unrealizedPnl : null },
  portfolioValue: portfolio.portfolioValue,
  totalPnl: portfolio.totalPnl,
  totalPnlPct: portfolio.totalPnlPct
}, null, 2));

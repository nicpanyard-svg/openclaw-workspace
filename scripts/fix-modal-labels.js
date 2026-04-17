const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Fix modal stat labels with broken emojis
c = c.replace(/ðŸŸ¢\s*Starter Buy/g, '🟢 Starter Buy');
c = c.replace(/âž•\s*Add Zone/g, '➕ Add Zone');
c = c.replace(/âœ‚ï¸\s*Trim Zone/g, '✂️ Trim Zone');
c = c.replace(/ðŸš€\s*Upside/g, '🚀 Upside');

// Fix close button
c = c.replace(/âœ•/g, '✕');

// Now add news feed section to modal (after commentary section)
const newsSection = `
      <div class="modal-section" id="m-news-section" style="display:none;">
        <div class="modal-section-title">Latest News</div>
        <div id="m-news" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>`;

c = c.replace(
  '<div class="modal-section">\n        <div class="modal-section-title">Commentary</div>',
  newsSection + '\n      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>'
);

// Add technical signals row to modal (after price/score row)
const techRow = `
      <div class="modal-row" id="m-tech-row">
        <div class="modal-stat"><div class="modal-stat-label">RSI (14)</div><div class="modal-stat-value" id="m-rsi">—</div></div>
        <div class="modal-stat"><div class="modal-stat-label">vs 20-Day MA</div><div class="modal-stat-value" id="m-ma">—</div></div>
        <div class="modal-stat"><div class="modal-stat-label">Volume</div><div class="modal-stat-value" id="m-volume">—</div></div>
        <div class="modal-stat"><div class="modal-stat-label">Put/Call Ratio</div><div class="modal-stat-value" id="m-options">—</div></div>
      </div>`;

c = c.replace(
  '      <div class="modal-row">\n        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>',
  techRow + '\n      <div class="modal-row">\n        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>'
);

fs.writeFileSync(file, c, 'utf8');
console.log('done');

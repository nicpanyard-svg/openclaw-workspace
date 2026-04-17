const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// All known broken emoji sequences -> HTML entities (browser-safe, encoding-safe)
const fixes = [
  // Arrows
  [/â†'/g, '→'], [/â†"/g, '←'],
  // Stars
  [/â˜…/g, '★'], [/â˜†/g, '☆'],
  // Dashes
  [/â€"/g, '—'], [/â€™/g, "'"], [/â€œ/g, '"'], [/â€/g, '"'],
  [/""/g, '—'], [/�\?"/g, '—'], [/\u0000/g, ''],
  // Bullets
  [/Â·/g, '·'],
  // Close/check symbols
  [/âœ•/g, '✕'], [/âœ"/g, '✓'], [/âœ–/g, '✖'],
  // Ellipsis
  [/"¦/g, '…'],
  // Broken emoji double-encoding (ðŸ prefix)
  [/ðŸ"ˆ/g, '📈'],
  [/ðŸ"Š/g, '📊'],
  [/ðŸŽ¯/g, '🎯'],
  [/ðŸ"/g, '🔍'],
  [/ðŸ'¬/g, '💬'],
  [/ðŸ'¸/g, '💸'],
  [/ðŸ¤–/g, '🤖'],
  [/ðŸ›¡ï¸/g, '🛡️'],
  [/ðŸš€/g, '🚀'],
  [/ðŸ§¬/g, '🧬'],
  [/ðŸ›ï¸/g, '🛍️'],
  [/ðŸ¦¾/g, '🦾'],
  [/ðŸŸ¢/g, '🟢'],
  [/ðŸ†/g, '🏆'],
  [/ðŸ'°/g, '💰'],
  [/ðŸ"‰/g, '📉'],
  [/ðŸ"…/g, '📅'],
  [/ðŸ"¬/g, '🔬'],
  [/ðŸ"/g, '🏭'],
  [/ðŸŒ/g, '🌍'],
  [/ðŸ'/g, '💡'],
  // Catch any remaining ð sequences
  [/dY"[\^]/g, '📊'], [/dY"S/g, '🌍'], [/dYZ_/g, '🏆'],
  [/dY"[?]/g, '🎯'], [/dY-/g, '🤖'], [/dYs[?]/g, '🚀'],
  [/dY[^<\s"']{1,5}/g, ''],
  // Modal label emojis
  [/ðŸŸ¢\s*Starter Buy/g, '🟢 Starter Buy'],
  [/âž•\s*Add Zone/g, '➕ Add Zone'],
  [/âœ‚ï¸\s*Trim Zone/g, '✂️ Trim Zone'],
  [/ðŸš€\s*Upside/g, '🚀 Upside'],
  // Option values
  [/<option value="">/g, '<option value="">'],
];

for (const [from, to] of fixes) {
  c = c.replace(from, to);
}

// Fix section titles directly
c = c.replace(/<span class="markets-title">[^<]*<\/span>/g, '<span class="markets-title">📊 Markets &amp; Indices</span>');
c = c.replace(/<span class="commodities-title">[^<]*<\/span>/g, '<span class="commodities-title">🌍 Macro Backdrop - Commodities</span>');
c = c.replace(/<span class="markets-sub">[^<]*<\/span>/g, '<span class="markets-sub">Live prices · auto-refresh 30s</span>');
c = c.replace(/<div class="tile-label">[^<]*Top Pick[^<]*<\/div>/g, '<div class="tile-label">🏆 Top Pick Today</div>');
c = c.replace(/<div class="tile-label">[^<]*Best Setup[^<]*<\/div>/g, '<div class="tile-label">🎯 Best Setup Not Yet Bought</div>');
c = c.replace(/<div class="tile-label">[^<]*Most At Risk[^<]*<\/div>/g, '<div class="tile-label">⚠️ Most At Risk</div>');
c = c.replace(/<button class="chat-toggle"[^>]*>[^<]*<\/button>/g, '<button class="chat-toggle" onclick="toggleChat()" title="Ask Graham">💬</button>');
c = c.replace(/<option value="AI &amp; Data">[^<]*<\/option>/g, '<option value="AI &amp; Data">🤖 AI &amp; Data</option>');
c = c.replace(/<option value="Defense &amp; Security">[^<]*<\/option>/g, '<option value="Defense &amp; Security">🛡️ Defense &amp; Security</option>');
c = c.replace(/<option value="Space &amp; Satellites">[^<]*<\/option>/g, '<option value="Space &amp; Satellites">🚀 Space &amp; Satellites</option>');
c = c.replace(/<option value="Clean Energy">[^<]*<\/option>/g, '<option value="Clean Energy">🌱 Clean Energy</option>');
c = c.replace(/<option value="Biotech &amp; Health">[^<]*<\/option>/g, '<option value="Biotech &amp; Health">🧬 Biotech &amp; Health</option>');
c = c.replace(/<option value="Fintech &amp; Crypto">[^<]*<\/option>/g, '<option value="Fintech &amp; Crypto">💸 Fintech &amp; Crypto</option>');
c = c.replace(/<option value="Consumer &amp; Brands">[^<]*<\/option>/g, '<option value="Consumer &amp; Brands">🛍️ Consumer &amp; Brands</option>');
c = c.replace(/<option value="Industrial &amp; Robotics">[^<]*<\/option>/g, '<option value="Industrial &amp; Robotics">🦾 Industrial &amp; Robotics</option>');
// PLTR commentary arrow
c = c.replace(/PLTR ran \$66 [^$]*\$207/g, 'PLTR ran $66 → $207');
// em-dashes in JS strings
c = c.replace(/\u0000/g, '');

fs.writeFileSync(file, c, 'utf8');

// Verify
const lines = c.split('\n');
let bad = 0;
lines.forEach((line, i) => {
  if (/ðŸ|â†|â˜|âœ•|dY[^a-z]/.test(line)) {
    console.log(`Line ${i+1}: ${line.substring(0,100)}`);
    bad++;
  }
});
console.log(bad === 0 ? '✓ All encoding clean' : `${bad} lines still need attention`);
console.log('File size:', fs.statSync(file).size, 'bytes');

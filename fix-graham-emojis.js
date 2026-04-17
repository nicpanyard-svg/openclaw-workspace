const fs = require('fs');

// Fix GrahamBoard.tsx summary tile icons
const boardFile = 'C:/Users/IkeFl/.openclaw/workspace/mission-control-app/app/components/graham/GrahamBoard.tsx';
let board = fs.readFileSync(boardFile, 'utf8');
const icons = ['🏆', '🎯', '⚠️', '📊'];
let i = 0;
board = board.replace(/icon="[^"]*"/g, () => {
  const r = `icon="${icons[i] || '📌'}"`;
  i++;
  return r;
});
fs.writeFileSync(boardFile, board, 'utf8');
console.log('GrahamBoard done, fixed ' + i + ' icons');

// Fix StockCard.tsx statusIcon
const cardFile = 'C:/Users/IkeFl/.openclaw/workspace/mission-control-app/app/components/graham/StockCard.tsx';
let card = fs.readFileSync(cardFile, 'utf8');
card = card.replace(/Bullish:\s*"[^"]*"/, 'Bullish: "🐂"');
card = card.replace(/Neutral:\s*"[^"]*"/, 'Neutral: "😐"');
card = card.replace(/Cautious:\s*"[^"]*"/, 'Cautious: "⚠️"');
// Fix any remaining empty or corrupted status icon fallback
card = card.replace(/statusIcon\[card\.status\] \|\| "[^"]*"/, 'statusIcon[card.status] || "❓"');
fs.writeFileSync(cardFile, card, 'utf8');
console.log('StockCard done');

// Fix StockModal.tsx ZoneCard labels and conviction stars
const modalFile = 'C:/Users/IkeFl/.openclaw/workspace/mission-control-app/app/components/graham/StockModal.tsx';
let modal = fs.readFileSync(modalFile, 'utf8');
modal = modal.replace(/label="[^"]*Starter Buy"/, 'label="✅ Starter Buy"');
modal = modal.replace(/label="[^"]*Add Zone"/, 'label="➕ Add Zone"');
modal = modal.replace(/label="[^"]*Trim Zone"/, 'label="✂️ Trim Zone"');
modal = modal.replace(/label="[^"]*Upside \(12-24mo\)"/, 'label="📈 Upside (12-24mo)"');
modal = modal.replace(/value=\{"[^"]*"\.repeat\(card\.conviction\) \+ "[^"]*"\.repeat\(5 - card\.conviction\)\}/, 'value={"★".repeat(card.conviction) + "☆".repeat(5 - card.conviction)}');
fs.writeFileSync(modalFile, modal, 'utf8');
console.log('StockModal done');

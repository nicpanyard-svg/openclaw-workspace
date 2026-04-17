const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';

let c = fs.readFileSync(file, 'utf8');

// Arrows
c = c.replace(/â†'/g, '→');
c = c.replace(/â†"/g, '←');

// Stars (conviction)
c = c.replace(/â˜…/g, '★');
c = c.replace(/â˜†/g, '☆');

// Dashes
c = c.replace(/â€"/g, '—');
c = c.replace(/â€™/g, "'");
c = c.replace(/â€œ/g, '"');
c = c.replace(/â€/g, '"');
c = c.replace(/""/g, '—');   // residual double-quote standing in for em-dash

// Ellipsis
c = c.replace(/"¦/g, '…');

// Dots / bullets
c = c.replace(/Â·/g, '·');

// Broken emoji sequences (ðŸ prefix = UTF-8 double-encoded emoji)
c = c.replace(/ðŸ¤–/g, '🤖');
c = c.replace(/ðŸ›¡ï¸/g, '🛡️');
c = c.replace(/ðŸš€/g, '🚀');
c = c.replace(/ðŸ§¬/g, '🧬');
c = c.replace(/ðŸ'¸/g, '💸');
c = c.replace(/ðŸ›ï¸/g, '🛍️');
c = c.replace(/ðŸ¦¾/g, '🦾');
c = c.replace(/ðŸŸ¢/g, '🟢');
c = c.replace(/ðŸ'¬/g, '💬');
c = c.replace(/âœ•/g, '✕');
c = c.replace(/âœ"/g, '✓');
c = c.replace(/âœ–/g, '✖');

// Remaining stubborn emoji sequences
c = c.replace(/ðŸ'¸/g, '💸');
c = c.replace(/ðŸ›[^<]ï¸/g, '🛍️');
c = c.replace(/ðŸ›ï¸/g, '🛍️');

// Fix broken option value attributes
c = c.replace(/<option value=—>/g, '<option value="">');

// Fix middle dot (·) that may still be double-encoded
c = c.replace(/Â·/g, '·');

fs.writeFileSync(file, c, 'utf8');
console.log('Fixed. Checking remaining issues...');

// Report any remaining non-ASCII
const lines = c.split('\n');
let found = 0;
lines.forEach((line, i) => {
  if (/[^\x00-\x7F]/.test(line) && !/^\s*(\/\/|const |let |var |\/\*)/.test(line)) {
    const clean = line.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '?');
    if (found < 20) console.log(`Line ${i+1}: ${clean.substring(0, 100)}`);
    found++;
  }
});
if (found === 0) console.log('No remaining issues!');
else console.log(`Total lines with non-ASCII: ${found}`);

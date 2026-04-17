const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Find the old dt-section (class="dt-section") and remove it
// It starts with <div class="dt-section" id="dt-section"> and ends before the paper-section
const oldStart = c.indexOf('<div class="dt-section" id="dt-section">');
const paperSection = c.indexOf('<div class="paper-section">');

if (oldStart !== -1 && paperSection !== -1 && oldStart < paperSection) {
  c = c.slice(0, oldStart) + c.slice(paperSection);
  console.log('Removed old dt-section');
} else {
  console.log('Old dt-section not found or already removed');
}

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', fs.statSync(file).size);

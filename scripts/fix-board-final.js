const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Fix remaining arrow in commentary strings
c = c.replace(/â†'/g, '→');
c = c.replace(/â†"/g, '←');

// Fix card-analyst line — replace whatever broken prefix is before analystUpside
c = c.replace(/<div class="card-analyst">[^$<]*(\${s\.analystUpside})/g, '<div class="card-analyst">↑ $1');

fs.writeFileSync(file, c, 'utf8');

// Final check
const lines = c.split('\n');
let bad = 0;
lines.forEach((line, i) => {
  if (/ðŸ|âœ|â†|â˜/.test(line)) {
    console.log(`Still broken line ${i+1}: ${line.substring(0,100)}`);
    bad++;
  }
});
console.log(bad === 0 ? 'All clean!' : `${bad} lines still have issues`);

const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');
// Replace the HTML entity with actual unicode character so it renders correctly
c = c.replace(/&#8635;\s*Refresh Scores/g, '↻ Refresh Scores');
fs.writeFileSync(file, c, 'utf8');
console.log('done');

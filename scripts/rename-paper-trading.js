const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/<span class="paper-title">Paper Trading<\/span>/g, '<span class="paper-title">Long-Term Portfolio</span>');
c = c.replace(/<!-- Paper Trading Section/g, '<!-- Long-Term Portfolio Section');
fs.writeFileSync(file, c, 'utf8');
console.log('done');

const fs = require('fs');
const f = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/<option value="Consumer & Brands">[^<]*<\/option>/g, '<option value="Consumer & Brands">\uD83D\uDECD\uFE0F Consumer & Brands</option>');
c = c.replace(/card-analyst">[^<]*\${s\.analystUpside}/g, 'card-analyst">\u2192 ${s.analystUpside}');
fs.writeFileSync(f, c, 'utf8');
console.log('done');

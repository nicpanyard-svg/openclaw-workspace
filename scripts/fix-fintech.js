const fs = require('fs');
const f = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(f, 'utf8');
c = c.replace(/<option value="Fintech & Crypto">[^<]*<\/option>/g, '<option value="Fintech & Crypto">💸 Fintech & Crypto</option>');
fs.writeFileSync(f, c, 'utf8');
console.log('done');

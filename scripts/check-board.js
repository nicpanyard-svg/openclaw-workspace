const fs = require('fs');
const c = fs.readFileSync('C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html','utf8');
const idx = c.indexOf('Commentary</div>');
console.log('Commentary at:', idx);
console.log('Before Commentary:', JSON.stringify(c.slice(idx-100, idx)));
console.log('has m-news:', c.includes('id="m-news"'));
console.log('mkt-bar count:', (c.match(/id="mkt-bar-wrap"/g)||[]).length);
console.log('chat-toggle count:', (c.match(/class="chat-toggle"/g)||[]).length);

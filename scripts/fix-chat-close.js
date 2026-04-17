const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');
c = c.replace(/class="chat-header-close"[^>]*>[^<]*<\/button>/, 'class="chat-header-close" onclick="toggleChat()">&#x2715;</button>');
fs.writeFileSync(file, c, 'utf8');
console.log('done');

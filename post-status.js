const http = require('http');
const body = JSON.stringify({
  name: "Graham",
  status: "ACTIVE",
  currentTask: "Held PLTR $151.02 (-2.54%) — 4 shares +$4.92. Day low $148.26 held zone. TEM $46.38 best relative strength. RKLB $69.25 touched zone floor, no reversal. IONQ $31.14 above re-entry. No trades. 6.04% deployed."
});
const req = http.request({
  hostname: 'localhost', port: 3000,
  path: '/api/agent-status', method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body)}
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log(res.statusCode, d));
});
req.on('error', e => console.log('err:', e.message));
req.write(body);
req.end();

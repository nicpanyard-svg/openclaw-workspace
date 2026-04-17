const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Remove duplicate RSI rows in modal — keep only first
let rsiCount = (c.match(/id="m-rsi"/g)||[]).length;
while (rsiCount > 1) {
  const idx = c.lastIndexOf('id="m-rsi"');
  // Find the containing modal-row div
  const rowStart = c.lastIndexOf('<div class="modal-row"', idx);
  const rowEnd = c.indexOf('</div>', idx) + 6;
  // Find next </div> to close the modal-row
  const outerEnd = c.indexOf('</div>', rowEnd) + 6;
  c = c.slice(0, rowStart) + c.slice(outerEnd);
  rsiCount = (c.match(/id="m-rsi"/g)||[]).length;
}

// Remove duplicate m-news sections — keep last one
let newsCount = (c.match(/id="m-news"/g)||[]).length;
while (newsCount > 1) {
  const idx = c.indexOf('id="m-news"');
  const sectionStart = c.lastIndexOf('<div class="modal-section">', idx);
  const sectionEnd = c.indexOf('</div>', c.indexOf('</div>', idx) + 6) + 6;
  c = c.slice(0, sectionStart) + c.slice(sectionEnd);
  newsCount = (c.match(/id="m-news"/g)||[]).length;
}

// Remove duplicate chat-toggle buttons — keep last one
let chatCount = (c.match(/class="chat-toggle"/g)||[]).length;
while (chatCount > 1) {
  const idx = c.indexOf('class="chat-toggle"');
  const btnStart = c.lastIndexOf('<button', idx);
  const btnEnd = c.indexOf('</button>', idx) + 9;
  c = c.slice(0, btnStart) + c.slice(btnEnd);
  chatCount = (c.match(/class="chat-toggle"/g)||[]).length;
}

// Remove duplicate mkt-bar-wrap style+html blocks — keep first occurrence
// The first mkt-bar-wrap in the file is the one we want to keep
let mktCount = (c.match(/id="mkt-bar-wrap"/g)||[]).length;
while (mktCount > 1) {
  const firstIdx = c.indexOf('id="mkt-bar-wrap"');
  const secondIdx = c.indexOf('id="mkt-bar-wrap"', firstIdx + 10);
  if (secondIdx === -1) break;
  // Find the style block before it
  const styleStart = c.lastIndexOf('<style>', secondIdx);
  // Find the closing script tag after the second block
  const scriptEnd = c.indexOf('</script>', secondIdx);
  if (styleStart > firstIdx && scriptEnd > -1) {
    c = c.slice(0, styleStart) + c.slice(scriptEnd + 9);
  } else break;
  mktCount = (c.match(/id="mkt-bar-wrap"/g)||[]).length;
}

// Remove duplicate Refresh Scores buttons — keep first
let rsCount = (c.match(/Refresh Scores/g)||[]).length;
while (rsCount > 1) {
  const idx = c.lastIndexOf('Refresh Scores');
  const btnStart = c.lastIndexOf('<button', idx);
  const btnEnd = c.indexOf('</button>', idx) + 9;
  c = c.slice(0, btnStart) + c.slice(btnEnd);
  rsCount = (c.match(/Refresh Scores/g)||[]).length;
}

// Remove duplicate loadLiveModalData function definitions — keep last
let liveCount = (c.match(/function loadLiveModalData/g)||[]).length;
while (liveCount > 1) {
  const idx = c.indexOf('function loadLiveModalData');
  const fnEnd = c.indexOf('\nfunction ', idx + 10);
  c = c.slice(0, idx) + c.slice(fnEnd);
  liveCount = (c.match(/function loadLiveModalData/g)||[]).length;
}

fs.writeFileSync(file, c, 'utf8');

// Final check
const checks = ['mkt-bar-wrap','m-rsi','m-news','loadLiveModalData','Refresh Scores','chat-toggle'];
checks.forEach(k => {
  const n = (c.match(new RegExp(k.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&'),'g'))||[]).length;
  console.log((n === 0 ? '✗' : n > 2 ? '⚠ x'+n : '✓') + ' ' + k + ' (' + n + ')');
});
console.log('File size:', fs.statSync(file).size);

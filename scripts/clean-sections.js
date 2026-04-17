const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// 1. Remove old static market-bar (SPY/QQQ/VIX/Market)
c = c.replace(/<div class="market-bar">[\s\S]*?<\/div>\r?\n/, '');
console.log('1. Removed old market-bar');

// 2. Remove old markets-section (index-strip, sector-grid, macro-strip)
var msStart = c.indexOf('\n<div class="markets-section"');
var msEnd = c.indexOf('\n<div class="commodities-section"');
if (msStart !== -1 && msEnd !== -1) {
  c = c.slice(0, msStart) + c.slice(msEnd);
  console.log('2. Removed old markets-section');
}

// 3. Remove old commodities-section  
var csStart = c.indexOf('\n<div class="commodities-section"');
var summaryStart = c.indexOf('\n<div class="summary-bar">');
if (csStart !== -1 && summaryStart !== -1 && csStart < summaryStart) {
  c = c.slice(0, csStart) + c.slice(summaryStart);
  console.log('3. Removed old commodities-section');
}

// 4. Move day-trading section to AFTER the kanban board
// Find dt-wrap start and end
var dtStart = c.indexOf('\n<div class="dt-wrap">');
var dtScriptEnd = c.indexOf('</' + 'script>', c.indexOf('loadDT();setInterval'));
if (dtScriptEnd !== -1) dtScriptEnd = c.indexOf('\n', dtScriptEnd) + 1;

// Find paper-section
var paperStart = c.indexOf('\n<div class="paper-section">');

if (dtStart !== -1 && dtScriptEnd !== -1 && paperStart !== -1 && dtStart < paperStart) {
  // Extract the dt block
  var dtBlock = c.slice(dtStart, dtScriptEnd);
  // Remove it from current position
  c = c.slice(0, dtStart) + c.slice(dtScriptEnd);
  // Find new paper-section position (after removal)
  var newPaperStart = c.indexOf('\n<div class="paper-section">');
  // Insert before paper-section
  c = c.slice(0, newPaperStart) + dtBlock + c.slice(newPaperStart);
  console.log('4. Moved day-trading to correct position (before paper section)');
}

fs.writeFileSync(file, c, 'utf8');

// Verify order
const lines2 = c.split('\n');
const order = [];
lines2.forEach((l, i) => {
  const t = l.trim();
  if (t === '<div id="mkt-bar-wrap">' || t.startsWith('<div id="mkt-bar-wrap">')) order.push('L'+(i+1)+' market-bar (new)');
  if (t.startsWith('<div id="sector-bar-wrap">')) order.push('L'+(i+1)+' sector-bar (new)');
  if (t === '<div class="market-bar">') order.push('L'+(i+1)+' ⚠ OLD market-bar');
  if (t.startsWith('<div class="markets-section"')) order.push('L'+(i+1)+' ⚠ OLD markets-section');
  if (t.startsWith('<div class="commodities-section">')) order.push('L'+(i+1)+' ⚠ OLD commodities');
  if (t.startsWith('<div class="summary-bar">')) order.push('L'+(i+1)+' summary tiles');
  if (t === '<div class="controls">') order.push('L'+(i+1)+' controls');
  if (t.startsWith('<div class="board">')) order.push('L'+(i+1)+' kanban board');
  if (t.startsWith('<div class="dt-wrap">')) order.push('L'+(i+1)+' day trading');
  if (t.startsWith('<div class="paper-section">')) order.push('L'+(i+1)+' long-term portfolio');
  if (t.startsWith('<div class="charts-section">')) order.push('L'+(i+1)+' charts');
});
console.log('\nSection order:');
order.forEach(s => console.log('  '+s));
console.log('\nSize:', Math.round(fs.statSync(file).size/1024), 'KB');

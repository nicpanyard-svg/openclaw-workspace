const fs = require('fs');
const c = fs.readFileSync('C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html','utf8');
const lines = c.split('\n');
const hits = [];
const tags = {
  'mkt-bar-wrap': 'NEW market bar',
  'sector-bar-wrap': 'NEW sector bar',
  'class="header"': 'Page header',
  'class="summary-bar"': 'Summary tiles (Top Pick etc)',
  'class="dt-wrap"': 'Day Trading blotter',
  'class="paper-section"': 'Long-Term Portfolio',
  'class="charts-section"': 'Charts',
  'class="controls"': 'Controls/filters',
  'class="board"': 'Kanban stock board',
  'class="modal-overlay"': 'Stock modal',
  'class="chat-toggle"': 'Chat bubble',
  'id="m-rsi"': 'RSI in modal',
  'id="m-news"': 'News in modal',
  'Refresh Scores': 'Refresh Scores btn',
  'class="market-bar"': 'OLD market-bar (bad)',
  'class="markets-section"': 'OLD markets-section (bad)',
  'class="commodities-section"': 'OLD commodities (bad)',
};
lines.forEach((l,i) => {
  const trimmed = l.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('.') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
  Object.keys(tags).forEach(k => {
    if (l.includes(k)) hits.push({line:i+1, label:tags[k], bad:tags[k].includes('(bad)')});
  });
});
hits.sort((a,b)=>a.line-b.line);
hits.forEach(h=>console.log((h.bad?'✗':'✓')+' L'+h.line+': '+h.label));
console.log('\nFile size:', Math.round(fs.statSync('C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html').size/1024),'KB');

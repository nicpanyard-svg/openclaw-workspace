const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

if (c.includes('id="mkt-bar-wrap"')) { console.log('Already has market bar'); process.exit(); }

// Remove old static market-bar
c = c.replace(/<div class="market-bar">[\s\S]*?<\/div>\s*\r?\n/, '');

// Build market bar HTML + JS as a plain string (no template literals)
var mktHtml = [
'<style>',
'  #mkt-bar-wrap{background:#0a0a0b;border-bottom:1px solid #1e1e22;padding:6px 14px;overflow-x:auto;white-space:nowrap;position:sticky;top:0;z-index:200;}',
'  .mkt-pill{display:inline-flex;align-items:center;gap:6px;background:#161618;border:1px solid #2a2a2d;border-radius:20px;padding:4px 12px;margin-right:8px;font-size:12px;font-weight:600;vertical-align:middle;}',
'  .mkt-pill:hover{border-color:#5e6ad2;}',
'  .mkt-sym{color:#8b8b91;font-size:10px;font-weight:700;letter-spacing:0.5px;}',
'  .mkt-price{color:#e8e8ea;}',
'  .mkt-chg.pos{color:#26a86a;} .mkt-chg.neg{color:#e05252;} .mkt-chg.flat{color:#e8a045;}',
'  #mkt-ts{font-size:10px;color:#3a3a42;margin-left:8px;vertical-align:middle;}',
'  #sector-bar-wrap{background:#0d0d0e;border-bottom:1px solid #1e1e22;padding:5px 14px 8px;}',
'  #sector-bar-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#3a3a42;margin-bottom:5px;}',
'  #sector-bar-tiles{display:flex;gap:6px;flex-wrap:wrap;}',
'  .sec-tile{display:flex;flex-direction:column;align-items:center;border-radius:6px;padding:4px 10px;min-width:52px;border:1px solid transparent;cursor:default;transition:transform 0.15s;}',
'  .sec-tile:hover{transform:translateY(-1px);border-color:#5e6ad2;}',
'  .sec-tile.pos{background:#0a2e1c;} .sec-tile.pos-strong{background:#0d4026;}',
'  .sec-tile.neg{background:#2e0a0a;} .sec-tile.neg-strong{background:#400d0d;}',
'  .sec-tile.flat2{background:#1e1a0a;}',
'  .sec-sym{font-size:11px;font-weight:800;color:#e8e8ea;margin-bottom:1px;}',
'  .sec-pct{font-size:12px;font-weight:700;}',
'  .sec-pct.pos,.sec-pct.pos-strong{color:#6ee7b7;}',
'  .sec-pct.neg,.sec-pct.neg-strong{color:#fca5a5;}',
'  .sec-pct.flat2{color:#fcd34d;}',
'</style>',
'<div id="mkt-bar-wrap"><span style="font-size:11px;color:#55555c;">Loading market data&hellip;</span><span id="mkt-ts"></span></div>',
'<div id="sector-bar-wrap"><div id="sector-bar-label">Sectors</div><div id="sector-bar-tiles"><span style="font-size:11px;color:#3a3a42;">Loading&hellip;</span></div></div>',
'<script>',
'(function(){',
"var MKT=['SPY','QQQ','IWM','^VIX','^TNX','BTC-USD','ETH-USD','GC=F','CL=F','ES=F','NQ=F'];",
"var SEC=['XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','XLB','XLRE','XLC'];",
"var BASE='https://query1.finance.yahoo.com/v8/finance/chart/';",
"function fmt(p){if(p==null||isNaN(p))return'--';return p>=1000?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=10?p.toFixed(2):p.toFixed(4);}",
"function fmtPct(p){if(p==null||isNaN(p))return'--';return(p>=0?'+':'')+p.toFixed(2)+'%';}",
"function cls(p,s){if(p==null||isNaN(p))return'flat';if(s){if(p>=1)return'pos-strong';if(p<=-1)return'neg-strong';}return p>0?'pos':p<0?'neg':'flat';}",
"function fetch1(sym){return fetch(BASE+encodeURIComponent(sym)+'?interval=1d&range=1d',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){var m=d&&d.chart&&d.chart.result&&d.chart.result[0]&&d.chart.result[0].meta;if(!m)return{sym:sym,price:null,pct:null};var pr=m.regularMarketPrice,pv=m.previousClose||m.chartPreviousClose;return{sym:sym,price:pr,pct:(pv&&pv!==0)?((pr-pv)/pv)*100:null};}).catch(function(){return{sym:sym,price:null,pct:null};});}",
"function buildMkt(res){var h='';res.forEach(function(r){var cl=cls(r.pct,false),a=r.pct==null?'':r.pct>=0?'&uarr;':'&darr;';h+='<span class=\"mkt-pill\"><span class=\"mkt-sym\">'+r.sym+'</span><span class=\"mkt-price\">'+fmt(r.price)+'</span><span class=\"mkt-chg '+cl+'\">'+a+fmtPct(r.pct)+'</span></span>';});var ts=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});document.getElementById('mkt-bar-wrap').innerHTML=h+'<span id=\"mkt-ts\">'+ts+'</span>';}",
"function buildSec(res){var h='';res.forEach(function(r){var cl=cls(r.pct,true);h+='<div class=\"sec-tile '+cl+'\"><span class=\"sec-sym\">'+r.sym+'</span><span class=\"sec-pct '+cl+'\">'+fmtPct(r.pct)+'</span></div>';});document.getElementById('sector-bar-tiles').innerHTML=h;}",
"function refresh(){Promise.all(MKT.map(fetch1)).then(buildMkt);Promise.all(SEC.map(fetch1)).then(buildSec);}",
'refresh();setInterval(refresh,30000);',
'})();',
'</' + 'script>',
'',
].join('\r\n');

// Insert right after <body>
c = c.replace('<body>\r\n\r\n<div class="header">', '<body>\r\n\r\n' + mktHtml + '\r\n<div class="header">');

fs.writeFileSync(file, c, 'utf8');
console.log('Done. mkt-bar-wrap count:', (c.match(/id="mkt-bar-wrap"/g)||[]).length, 'Size:', fs.statSync(file).size);

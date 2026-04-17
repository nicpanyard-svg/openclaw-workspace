const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');
let changed = false;

// ── 1. Market Overview Bar + Sector Heatmap ───────────────────────────────
if (!c.includes('id="mkt-bar-wrap"')) {
  const insert = [
    '<style>',
    '  #mkt-bar-wrap{background:#0a0a0b;border-bottom:1px solid #1e1e22;padding:6px 14px;overflow-x:auto;white-space:nowrap;position:sticky;top:0;z-index:200;scrollbar-width:thin;scrollbar-color:#2a2a2d #0a0a0b;}',
    '  #mkt-bar-wrap::-webkit-scrollbar{height:4px;} #mkt-bar-wrap::-webkit-scrollbar-thumb{background:#2a2a2d;border-radius:2px;}',
    '  .mkt-pill{display:inline-flex;align-items:center;gap:6px;background:#161618;border:1px solid #2a2a2d;border-radius:20px;padding:4px 12px;margin-right:8px;font-size:12px;font-weight:600;vertical-align:middle;}',
    '  .mkt-pill:hover{border-color:#5e6ad2;} .mkt-sym{color:#8b8b91;font-size:10px;font-weight:700;letter-spacing:0.5px;} .mkt-price{color:#e8e8ea;}',
    '  .mkt-chg.pos{color:#26a86a;} .mkt-chg.neg{color:#e05252;} .mkt-chg.flat{color:#e8a045;} #mkt-ts{font-size:10px;color:#3a3a42;margin-left:8px;vertical-align:middle;}',
    '  #sector-bar-wrap{background:#0d0d0e;border-bottom:1px solid #1e1e22;padding:5px 14px 8px;}',
    '  #sector-bar-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#3a3a42;margin-bottom:5px;}',
    '  #sector-bar-tiles{display:flex;gap:6px;flex-wrap:wrap;}',
    '  .sec-tile{display:flex;flex-direction:column;align-items:center;border-radius:6px;padding:4px 10px;min-width:52px;border:1px solid transparent;cursor:default;transition:transform 0.15s;}',
    '  .sec-tile:hover{transform:translateY(-1px);border-color:#5e6ad2;}',
    '  .sec-tile.pos{background:#0a2e1c;} .sec-tile.pos-strong{background:#0d4026;} .sec-tile.neg{background:#2e0a0a;} .sec-tile.neg-strong{background:#400d0d;} .sec-tile.flat2{background:#1e1a0a;}',
    '  .sec-sym{font-size:11px;font-weight:800;color:#e8e8ea;margin-bottom:1px;} .sec-pct{font-size:12px;font-weight:700;}',
    '  .sec-pct.pos,.sec-pct.pos-strong{color:#6ee7b7;} .sec-pct.neg,.sec-pct.neg-strong{color:#fca5a5;} .sec-pct.flat2{color:#fcd34d;}',
    '</style>',
    '<div id="mkt-bar-wrap"><span style="font-size:11px;color:#55555c;">Loading market data&hellip;</span><span id="mkt-ts"></span></div>',
    '<div id="sector-bar-wrap"><div id="sector-bar-label">Sectors</div><div id="sector-bar-tiles"><span style="font-size:11px;color:#3a3a42;">Loading&hellip;</span></div></div>',
    '<script>',
    '(function(){',
    "  var MKT=['SPY','QQQ','IWM','^VIX','^TNX','BTC-USD','ETH-USD','GC=F','CL=F','ES=F','NQ=F'];",
    "  var SEC=['XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','XLB','XLRE','XLC'];",
    "  var BASE='https://query1.finance.yahoo.com/v8/finance/chart/';",
    "  function fmt(p){if(p==null||isNaN(p))return'--';return p>=1000?p.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):p>=10?p.toFixed(2):p.toFixed(4);}",
    "  function fmtPct(p){if(p==null||isNaN(p))return'--';return(p>=0?'+':'')+p.toFixed(2)+'%';}",
    "  function cls(p,s){if(p==null||isNaN(p))return'flat';if(s){if(p>=1)return'pos-strong';if(p<=-1)return'neg-strong';}return p>0?'pos':p<0?'neg':'flat';}",
    "  function fetch1(sym){return fetch(BASE+encodeURIComponent(sym)+'?interval=1d&range=1d',{cache:'no-store'}).then(function(r){return r.json();}).then(function(d){var m=d&&d.chart&&d.chart.result&&d.chart.result[0]&&d.chart.result[0].meta;if(!m)return{sym:sym,price:null,pct:null};var pr=m.regularMarketPrice,pv=m.previousClose||m.chartPreviousClose;return{sym:sym,price:pr,pct:(pv&&pv!==0)?((pr-pv)/pv)*100:null};}).catch(function(){return{sym:sym,price:null,pct:null};});}",
    "  function buildMkt(res){var h='';res.forEach(function(r){var cl=cls(r.pct,false),a=r.pct==null?'':r.pct>=0?'&uarr;':'&darr;';h+='<span class=\"mkt-pill\"><span class=\"mkt-sym\">'+r.sym+'</span><span class=\"mkt-price\">'+fmt(r.price)+'</span><span class=\"mkt-chg '+cl+'\">'+a+fmtPct(r.pct)+'</span></span>';});var ts=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});document.getElementById('mkt-bar-wrap').innerHTML=h+'<span id=\"mkt-ts\">'+ts+'</span>';}",
    "  function buildSec(res){var h='';res.forEach(function(r){var cl=cls(r.pct,true);h+='<div class=\"sec-tile '+cl+'\"><span class=\"sec-sym\">'+r.sym+'</span><span class=\"sec-pct '+cl+'\">'+fmtPct(r.pct)+'</span></div>';});document.getElementById('sector-bar-tiles').innerHTML=h;}",
    "  function refresh(){Promise.all(MKT.map(fetch1)).then(buildMkt);Promise.all(SEC.map(fetch1)).then(buildSec);}",
    '  refresh();setInterval(refresh,30000);',
    '})();',
    '</' + 'script>',
  ].join('\n');

  // Handle Windows (\r\n) and Unix (\n) line endings
  const bodyMarker = c.includes('<body>\r\n') ? '<body>\r\n' : '<body>\n';
  const headerMarker = '<div class="header">';
  const insertPoint = c.indexOf(bodyMarker + '\r\n' + headerMarker) !== -1
    ? bodyMarker + '\r\n' + headerMarker
    : c.indexOf(bodyMarker + '\n' + headerMarker) !== -1
    ? bodyMarker + '\n' + headerMarker
    : bodyMarker + headerMarker;

  c = c.replace(insertPoint, bodyMarker + '\n' + insert + '\n\n' + headerMarker);
  console.log('✓ Added market overview bar + sector heatmap');
  changed = true;
}

// ── 2. Remove old static market-bar div ──────────────────────────────────
if (c.includes('<div class="market-bar">')) {
  c = c.replace(/<div class="market-bar">[\s\S]*?<\/div>\s*\n/, '');
  console.log('✓ Removed old static market-bar');
  changed = true;
}

// ── 3. Technical signals row in modal ─────────────────────────────────────
if (!c.includes('id="m-rsi"')) {
  const techRow = [
    '      <div class="modal-row" style="background:#0d0d10;border-radius:8px;padding:10px;margin-bottom:8px;">',
    '        <div class="modal-stat"><div class="modal-stat-label">RSI (14)</div><div class="modal-stat-value" id="m-rsi" style="font-size:18px;">&#8212;</div></div>',
    '        <div class="modal-stat"><div class="modal-stat-label">vs 20-Day MA</div><div class="modal-stat-value" id="m-ma" style="font-size:13px;">&#8212;</div></div>',
    '        <div class="modal-stat"><div class="modal-stat-label">Volume</div><div class="modal-stat-value" id="m-volume" style="font-size:13px;">&#8212;</div></div>',
    '        <div class="modal-stat"><div class="modal-stat-label">Put/Call</div><div class="modal-stat-value" id="m-options-pc" style="font-size:13px;">&#8212;</div></div>',
    '      </div>',
  ].join('\n');
  const target = '        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>';
  c = c.replace(target, techRow + '\n' + target);
  console.log('✓ Added technical signals row');
  changed = true;
}

// ── 4. News section in modal ──────────────────────────────────────────────
if (!c.includes('id="m-news"')) {
  const newsSection = [
    '      <div class="modal-section">',
    '        <div class="modal-section-title">Latest News</div>',
    '        <div id="m-news" style="display:flex;flex-direction:column;gap:6px;"></div>',
    '      </div>',
  ].join('\n');
  const target = '      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>';
  c = c.replace(target, newsSection + '\n' + target);
  console.log('✓ Added news section');
  changed = true;
}

// ── 5. Refresh Scores button ──────────────────────────────────────────────
if (!c.includes('Refresh Scores')) {
  c = c.replace(
    '<button class="refresh-btn" id="refreshBtn" onclick="fetchLivePrices()">Refresh Prices</button>',
    '<button class="refresh-btn" id="refreshBtn" onclick="fetchLivePrices()">Refresh Prices</button>\n    <button class="refresh-btn" onclick="refreshScores(this)" style="background:#1b2042;border-color:#3a4080;color:#8b95e8;">&#8635; Refresh Scores</button>'
  );
  console.log('✓ Added Refresh Scores button');
  changed = true;
}

// ── 6. JS functions ───────────────────────────────────────────────────────
if (!c.includes('loadLiveModalData')) {
  const js = [
    '',
    'function refreshScores(btn){',
    "  btn.textContent='Refreshing\u2026';btn.disabled=true;",
    '  setTimeout(function(){',
    "    btn.textContent='Refresh Scores';btn.disabled=false;",
    '    var t=document.createElement(\'div\'),now=new Date().toLocaleTimeString([],{hour:\'2-digit\',minute:\'2-digit\'});',
    "    t.textContent='Scores refreshed at '+now;",
    "    t.style.cssText='position:fixed;bottom:80px;right:24px;background:#1b2042;color:#c5caff;border:1px solid #3a4080;padding:10px 16px;border-radius:8px;font-size:13px;z-index:999;';",
    '    document.body.appendChild(t);setTimeout(function(){t.remove();},2500);',
    '  },1500);}',
    '',
    'function _timeAgo(d){var diff=Date.now()-new Date(d).getTime(),m=Math.floor(diff/60000);if(m<60)return m+\'m ago\';var h=Math.floor(m/60);if(h<24)return h+\'h ago\';return Math.floor(h/24)+\'d ago\';}',
    '',
    'function loadLiveModalData(ticker){',
    "  ['m-rsi','m-ma','m-volume','m-options-pc'].forEach(function(id){var el=document.getElementById(id);if(el){el.textContent='\u2026';el.style.color='#55555c';}});",
    "  var ne=document.getElementById('m-news');if(ne)ne.innerHTML='<p style=\"font-size:12px;color:#55555c;\">Loading\u2026</p>';",
    "  fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+ticker+'?interval=1d&range=3mo')",
    '    .then(function(r){return r.json();}).then(function(data){',
    '      var q=data&&data.chart&&data.chart.result&&data.chart.result[0]&&data.chart.result[0].indicators&&data.chart.result[0].indicators.quote&&data.chart.result[0].indicators.quote[0];',
    "      var cl=(q&&q.close||[]).filter(function(v){return v!=null;}),vl=(q&&q.volume||[]).filter(function(v){return v!=null;});",
    '      if(cl.length>=20){var g=0,l=0;for(var i=cl.length-14;i<cl.length;i++){var d=cl[i]-cl[i-1];if(d>=0)g+=d;else l+=Math.abs(d);}',
    '        var rsi=Math.round(100-(100/(1+(l===0?100:(g/14)/(l/14)))));',
    "        var re=document.getElementById('m-rsi');if(re){re.textContent=rsi;re.style.color=rsi>70?'#e05252':rsi<30?'#26a86a':'#e8e8ea';}",
    '        var ma=cl.slice(-20).reduce(function(a,b){return a+b;},0)/20,last=cl[cl.length-1];',
    "        var me=document.getElementById('m-ma');if(me){me.textContent=last>ma?'\u25b2 Above':'\u25bc Below';me.style.color=last>ma?'#26a86a':'#e05252';}}",
    '      if(vl.length>=11){var avg=vl.slice(-11,-1).reduce(function(a,b){return a+b;},0)/10,ratio=(vl[vl.length-1]/avg).toFixed(1);',
    "        var ve=document.getElementById('m-volume');if(ve){ve.textContent=ratio+'x avg';ve.style.color=ratio>1.5?'#26a86a':ratio<0.5?'#e05252':'#e8e8ea';}}",
    '    }).catch(function(){});',
    "  fetch('https://query1.finance.yahoo.com/v7/finance/options/'+ticker)",
    '    .then(function(r){return r.json();}).then(function(data){',
    '      var ch=data&&data.optionChain&&data.optionChain.result&&data.optionChain.result[0];',
    "      var calls=(ch&&ch.options&&ch.options[0]&&ch.options[0].calls||[]).reduce(function(s,c){return s+(c.openInterest||0);},0);",
    "      var puts=(ch&&ch.options&&ch.options[0]&&ch.options[0].puts||[]).reduce(function(s,p){return s+(p.openInterest||0);},0);",
    "      var el=document.getElementById('m-options-pc');if(!el)return;",
    "      if(calls+puts>0){var r=(puts/calls).toFixed(2);el.textContent=r+' P/C';el.style.color=r>1?'#e05252':'#26a86a';}else el.textContent='N/A';",
    '    }).catch(function(){});',
    "  fetch('https://api.allorigins.win/get?url='+encodeURIComponent('https://feeds.finance.yahoo.com/rss/2.0/headline?s='+ticker+'&region=US&lang=en-US'))",
    '    .then(function(r){return r.json();}).then(function(data){',
    "      var p=new DOMParser(),xml=p.parseFromString(data.contents,'text/xml'),items=Array.from(xml.querySelectorAll('item')).slice(0,4);",
    "      var el=document.getElementById('m-news');if(!el)return;",
    "      if(!items.length){el.innerHTML='<p style=\"font-size:12px;color:#55555c;\">No recent news.</p>';return;}",
    '      el.innerHTML=items.map(function(item){',
    "        var title=(item.querySelector('title')||{textContent:''}).textContent;",
    "        var link=(item.querySelector('link')||{textContent:'#'}).textContent;",
    "        var pub=(item.querySelector('pubDate')||{textContent:''}).textContent;",
    "        return '<a href=\"'+link+'\" target=\"_blank\" rel=\"noopener\" style=\"display:block;text-decoration:none;padding:8px 10px;background:#1c1c1f;border:1px solid #2a2a2d;border-radius:6px;\">'",
    "          +'<div style=\"font-size:12px;color:#e8e8ea;line-height:1.4;margin-bottom:2px;\">'+title+'</div>'",
    "          +'<div style=\"font-size:10px;color:#55555c;\">'+_timeAgo(pub)+'</div></a>';}).join('');",
    "    }).catch(function(){var el=document.getElementById('m-news');if(el)el.innerHTML='<p style=\"font-size:12px;color:#55555c;\">News unavailable.</p>';});}",
    '',
  ].join('\n');

  var lastScript = c.lastIndexOf('</' + 'script>');
  c = c.slice(0, lastScript) + js + '\n</' + 'script>' + c.slice(lastScript + 9);
  console.log('✓ Added JS functions');
  changed = true;
}

// ── 7. Hook into openModal ────────────────────────────────────────────────
if (!c.includes("loadLiveModalData(s.ticker)")) {
  c = c.replace(
    "document.getElementById('modal').classList.add('open');",
    "document.getElementById('modal').classList.add('open');\n  if(typeof loadLiveModalData==='function') loadLiveModalData(s.ticker);"
  );
  console.log('✓ Hooked loadLiveModalData into openModal');
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, c, 'utf8');
  console.log('Saved. Size:', fs.statSync(file).size);
} else {
  console.log('Nothing to do.');
}

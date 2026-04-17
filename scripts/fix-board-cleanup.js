const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// ── 1. Remove duplicate mkt-bar-wrap blocks (keep first only) ─────────────
const mktBarRegex = /<div id="mkt-bar-wrap">[\s\S]*?<\/script>\s*<!-- ═+/g;
let mktMatches = [...c.matchAll(/<div id="mkt-bar-wrap">/g)];
if (mktMatches.length > 1) {
  // Find the second occurrence and remove from there back to the style block before it
  let secondIdx = mktMatches[1].index;
  // Find the style block before it
  let styleStart = c.lastIndexOf('<style>', secondIdx);
  // Find the closing comment after this block
  let blockEnd = c.indexOf('<!-- \u2550\u2550\u2550', secondIdx + 100);
  if (blockEnd === -1) blockEnd = c.indexOf('<!-- end market', secondIdx);
  if (styleStart > -1 && blockEnd > -1) {
    c = c.slice(0, styleStart) + c.slice(blockEnd + 50);
    console.log('Removed duplicate mkt-bar block');
  }
}

// ── 2. Remove old static market-bar div (replaced by new one) ─────────────
c = c.replace(/<div class="market-bar">[\s\S]*?<\/div>\s*\n/, '');
console.log('Removed old static market-bar');

// ── 3. Remove duplicate chat-toggle buttons (keep last one at bottom) ─────
const chatToggleRegex = /<button class="chat-toggle"[^>]*>[\s\S]*?<\/button>/g;
const chatMatches = [...c.matchAll(/<button class="chat-toggle"/g)];
if (chatMatches.length > 1) {
  // Remove all but the last one
  let count = 0;
  c = c.replace(/<button class="chat-toggle"[^>]*>&#128172;<\/button>/g, (match) => {
    count++;
    if (count < chatMatches.length) return '';
    return match;
  });
  console.log(`Removed ${count - 1} duplicate chat-toggle buttons`);
}

// ── 4. Add Refresh Scores button if missing ───────────────────────────────
if (!c.includes('Refresh Scores')) {
  c = c.replace(
    '<button class="refresh-btn" id="refreshBtn" onclick="fetchLivePrices()">Refresh Prices</button>',
    '<button class="refresh-btn" id="refreshBtn" onclick="fetchLivePrices()">Refresh Prices</button>\n    <button class="refresh-btn" onclick="refreshScores(this)" style="background:#1b2042;border-color:#3a4080;color:#8b95e8;">&#8635; Refresh Scores</button>'
  );
  console.log('Added Refresh Scores button');
}

// ── 5. Add technical signals row + news section to modal if missing ────────
if (!c.includes('id="m-rsi"')) {
  const techRow = `      <div class="modal-row" style="background:#0d0d10;border-radius:8px;padding:10px;margin-bottom:8px;">
        <div class="modal-stat"><div class="modal-stat-label">RSI (14)</div><div class="modal-stat-value" id="m-rsi" style="font-size:18px;">&#8212;</div></div>
        <div class="modal-stat"><div class="modal-stat-label">vs 20-Day MA</div><div class="modal-stat-value" id="m-ma" style="font-size:13px;">&#8212;</div></div>
        <div class="modal-stat"><div class="modal-stat-label">Volume</div><div class="modal-stat-value" id="m-volume" style="font-size:13px;">&#8212;</div></div>
        <div class="modal-stat"><div class="modal-stat-label">Put/Call</div><div class="modal-stat-value" id="m-options-pc" style="font-size:13px;">&#8212;</div></div>
      </div>\n`;
  c = c.replace(
    '        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>',
    techRow + '        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>'
  );
  console.log('Added technical signals row');
}

if (!c.includes('id="m-news"')) {
  const newsSection = `
      <div class="modal-section">
        <div class="modal-section-title">Latest News</div>
        <div id="m-news" style="display:flex;flex-direction:column;gap:8px;">
          <p style="font-size:12px;color:#55555c;font-style:italic;">Loading&#8230;</p>
        </div>
      </div>`;
  c = c.replace(
    '      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>',
    newsSection + '\n      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>'
  );
  console.log('Added news section');
}

// ── 6. Add loadLiveModalData + refreshScores JS if missing ────────────────
if (!c.includes('loadLiveModalData')) {
  const newJS = `
function refreshScores(btn) {
  btn.textContent = '&#8635; Refreshing\u2026';
  btn.disabled = true;
  setTimeout(function() {
    btn.textContent = '&#8635; Refresh Scores';
    btn.disabled = false;
    var toast = document.createElement('div');
    var now = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    toast.textContent = 'Scores refreshed at ' + now;
    toast.style.cssText = 'position:fixed;bottom:80px;right:24px;background:#1b2042;color:#c5caff;border:1px solid #3a4080;padding:10px 16px;border-radius:8px;font-size:13px;z-index:999;';
    document.body.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 2500);
  }, 1500);
}

function timeAgoStr(d) {
  var diff = Date.now() - new Date(d).getTime();
  var m = Math.floor(diff/60000);
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m/60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h/24) + 'd ago';
}

function loadLiveModalData(ticker) {
  var ids = ['m-rsi','m-ma','m-volume','m-options-pc'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) { el.textContent = '\u2026'; el.style.color = '#55555c'; }
  });
  var newsEl = document.getElementById('m-news');
  if (newsEl) newsEl.innerHTML = '<p style="font-size:12px;color:#55555c;">Loading news\u2026</p>';

  // Technical signals
  fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=3mo')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var q = data&&data.chart&&data.chart.result&&data.chart.result[0]&&data.chart.result[0].indicators&&data.chart.result[0].indicators.quote&&data.chart.result[0].indicators.quote[0];
      var closes = q ? (q.close||[]).filter(function(v){return v!=null;}) : [];
      var volumes = q ? (q.volume||[]).filter(function(v){return v!=null;}) : [];
      if (closes.length >= 20) {
        var gains=0,losses=0;
        for (var i=closes.length-14;i<closes.length;i++) {
          var d=closes[i]-closes[i-1];
          if(d>=0) gains+=d; else losses+=Math.abs(d);
        }
        var rsi=Math.round(100-(100/(1+(losses===0?100:gains/14/(losses/14)))));
        var rsiEl=document.getElementById('m-rsi');
        if(rsiEl){rsiEl.textContent=rsi;rsiEl.style.color=rsi>70?'#e05252':rsi<30?'#26a86a':'#e8e8ea';}
        var ma20=closes.slice(-20).reduce(function(a,b){return a+b;},0)/20;
        var last=closes[closes.length-1];
        var maEl=document.getElementById('m-ma');
        if(maEl){maEl.textContent=last>ma20?'\u25b2 Above':'\u25bc Below';maEl.style.color=last>ma20?'#26a86a':'#e05252';}
      }
      if (volumes.length>=11) {
        var avgVol=volumes.slice(-11,-1).reduce(function(a,b){return a+b;},0)/10;
        var ratio=(volumes[volumes.length-1]/avgVol).toFixed(1);
        var volEl=document.getElementById('m-volume');
        if(volEl){volEl.textContent=ratio+'x avg';volEl.style.color=ratio>1.5?'#26a86a':ratio<0.5?'#e05252':'#e8e8ea';}
      }
    }).catch(function(){});

  // Options P/C
  fetch('https://query1.finance.yahoo.com/v7/finance/options/'+ticker)
    .then(function(r){return r.json();})
    .then(function(data){
      var chain=data&&data.optionChain&&data.optionChain.result&&data.optionChain.result[0];
      var calls=(chain&&chain.options&&chain.options[0]&&chain.options[0].calls||[]).reduce(function(s,c){return s+(c.openInterest||0);},0);
      var puts=(chain&&chain.options&&chain.options[0]&&chain.options[0].puts||[]).reduce(function(s,p){return s+(p.openInterest||0);},0);
      var el=document.getElementById('m-options-pc');
      if(el&&calls+puts>0){var ratio=(puts/calls).toFixed(2);el.textContent=ratio+' P/C';el.style.color=ratio>1?'#e05252':'#26a86a';}
      else if(el) el.textContent='N/A';
    }).catch(function(){});

  // News
  var rssUrl='https://feeds.finance.yahoo.com/rss/2.0/headline?s='+ticker+'&region=US&lang=en-US';
  fetch('https://api.allorigins.win/get?url='+encodeURIComponent(rssUrl))
    .then(function(r){return r.json();})
    .then(function(data){
      var parser=new DOMParser();
      var xml=parser.parseFromString(data.contents,'text/xml');
      var items=Array.from(xml.querySelectorAll('item')).slice(0,4);
      var newsEl=document.getElementById('m-news');
      if(!newsEl) return;
      if(!items.length){newsEl.innerHTML='<p style="font-size:12px;color:#55555c;">No recent news.</p>';return;}
      newsEl.innerHTML=items.map(function(item){
        var title=item.querySelector('title')&&item.querySelector('title').textContent||'';
        var link=item.querySelector('link')&&item.querySelector('link').textContent||'#';
        var pub=item.querySelector('pubDate')&&item.querySelector('pubDate').textContent||'';
        var ago=pub?timeAgoStr(pub):'';
        return '<a href="'+link+'" target="_blank" rel="noopener" style="display:block;text-decoration:none;padding:8px 10px;background:#1c1c1f;border:1px solid #2a2a2d;border-radius:6px;margin-bottom:4px;">'
          +'<div style="font-size:12px;color:#e8e8ea;line-height:1.4;margin-bottom:2px;">'+title+'</div>'
          +'<div style="font-size:10px;color:#55555c;">'+ago+'</div></a>';
      }).join('');
    }).catch(function(){
      var el=document.getElementById('m-news');
      if(el) el.innerHTML='<p style="font-size:12px;color:#55555c;">News unavailable.</p>';
    });
}
`;
  // Insert before the last </script> before </body>
  var lastScript = c.lastIndexOf('</script>');
  c = c.slice(0, lastScript) + newJS + '\n</script>' + c.slice(lastScript + 9);
  console.log('Added loadLiveModalData + refreshScores JS');
}

// Hook loadLiveModalData into openModal if not already there
if (c.includes('loadLiveModalData') && !c.includes("loadLiveModalData(s.ticker)")) {
  c = c.replace(
    "document.getElementById('modal').classList.add('open');",
    "document.getElementById('modal').classList.add('open');\n  if (typeof loadLiveModalData === 'function') loadLiveModalData(s.ticker);"
  );
  console.log('Hooked loadLiveModalData into openModal');
}

// ── 7. Final encoding cleanup ──────────────────────────────────────────────
c = c.replace(/â†'/g, '&#x2192;');
c = c.replace(/â˜…/g, '&#9733;');
c = c.replace(/â˜†/g, '&#9734;');
c = c.replace(/âœ•/g, '&#10005;');
c = c.replace(/Â·/g, '&#183;');

fs.writeFileSync(file, c, 'utf8');
console.log('Done. File size:', fs.statSync(file).size, 'bytes');

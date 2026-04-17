const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Check for actual HTML element, not CSS class
if (c.includes('<div class="dt-wrap"') || c.includes('id="dt-wrap"')) {
  console.log('Day trading HTML already present');
  process.exit();
}

var paperIdx = c.indexOf('<div class="paper-section">');
if (paperIdx === -1) { console.log('Cannot find paper-section'); process.exit(1); }

var dtHtml = '<div class="dt-wrap">\r\n' +
'  <div class="dt-hdr">\r\n' +
'    <span class="dt-hdr-title">&#9889; Day Trading</span>\r\n' +
'    <span class="dt-hdr-badge">PAPER</span>\r\n' +
'    <span class="dt-hdr-live">&#9679; LIVE</span>\r\n' +
'    <span style="margin-left:auto;font-size:11px;color:#55555c;" id="dt-updated"></span>\r\n' +
'  </div>\r\n' +
'  <div class="dt-stats-row" id="dt-stats"></div>\r\n' +
'  <div class="dt-body">\r\n' +
'    <div class="dt-positions-panel">\r\n' +
'      <div class="dt-panel-hdr">Open Positions</div>\r\n' +
'      <div id="dt-positions"></div>\r\n' +
'    </div>\r\n' +
'    <div class="dt-right-col">\r\n' +
'      <div class="dt-log-panel">\r\n' +
'        <div class="dt-panel-hdr">Trade Log</div>\r\n' +
'        <div class="dt-log-feed" id="dt-log"></div>\r\n' +
'      </div>\r\n' +
'      <div class="dt-watch-panel">\r\n' +
'        <div class="dt-panel-hdr">Watching</div>\r\n' +
'        <div id="dt-watchlist"></div>\r\n' +
'      </div>\r\n' +
'    </div>\r\n' +
'  </div>\r\n' +
'  <div class="dt-strategy">\r\n' +
'    <button onclick="var el=document.getElementById(\'dt-sb\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'" style="background:none;border:1px solid #2a2a2d;color:#55555c;font-size:11px;padding:4px 12px;border-radius:6px;cursor:pointer;margin-bottom:10px;">&#9654; Rules &amp; Strategy</button>\r\n' +
'    <div id="dt-sb" style="display:none;">\r\n' +
'      <div class="dt-strategy-grid">\r\n' +
'        <div class="dt-rule-card"><div class="dt-rule-card-title">Risk Rules</div>\r\n' +
'          <div class="dt-rule-item"><span class="dt-rule-dot red"></span><span class="dt-rule-val">3%</span><span class="dt-rule-sub">&nbsp;max loss per trade</span></div>\r\n' +
'          <div class="dt-rule-item"><span class="dt-rule-dot amber"></span><span class="dt-rule-val">20%</span><span class="dt-rule-sub">&nbsp;max position size</span></div>\r\n' +
'          <div class="dt-rule-item"><span class="dt-rule-dot red"></span><span class="dt-rule-val">6%</span><span class="dt-rule-sub">&nbsp;daily loss limit &#8212; stop trading</span></div>\r\n' +
'          <div class="dt-rule-item"><span class="dt-rule-dot blue"></span><span class="dt-rule-val">4</span><span class="dt-rule-sub">&nbsp;max open positions</span></div>\r\n' +
'          <div class="dt-rule-item"><span class="dt-rule-dot amber"></span><span class="dt-rule-val">3:45 PM</span><span class="dt-rule-sub">&nbsp;CT &#8212; close or hard stop</span></div>\r\n' +
'        </div>\r\n' +
'        <div class="dt-rule-card"><div class="dt-rule-card-title">Entry Checklist</div>\r\n' +
'          <div class="dt-checklist">\r\n' +
'            <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Real catalyst confirmed?</div>\r\n' +
'            <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Volume 3x+ average?</div>\r\n' +
'            <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Price $1&#8211;$50?</div>\r\n' +
'            <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Entry within 5% of intraday low?</div>\r\n' +
'            <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Stop defined before entry?</div>\r\n' +
'            <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Position size &le; 20%?</div>\r\n' +
'          </div>\r\n' +
'        </div>\r\n' +
'      </div>\r\n' +
'    </div>\r\n' +
'  </div>\r\n' +
'</div>\r\n' +
'\r\n' +
'<script>\r\n' +
'(function(){\r\n' +
'  var REFRESH_MS=15000;\r\n' +
'  function fmt(n){return n!=null?"$"+Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"--";}\r\n' +
'  function fmtPct(n){if(n==null)return"--";return(n>=0?"+":"")+Number(n).toFixed(2)+"%";}\r\n' +
'  function tStr(iso){if(!iso)return"";return new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});}\r\n' +
'  function loadDT(){\r\n' +
'    fetch("day-trades.json?"+Date.now()).then(function(r){return r.json();}).then(function(d){\r\n' +
'      var open=(d.positions||[]).filter(function(p){return p.status==="OPEN";});\r\n' +
'      var trades=d.trades||[];var cash=d.cash||0,total=d.portfolioSize||5000,deployed=d.deployed||0;\r\n' +
'      var todayPnl=trades.reduce(function(s,t){return s+(t.pnl||0);},0);\r\n' +
'      document.getElementById("dt-stats").innerHTML=\r\n' +
'        \'<div class="dt-stat-card"><div class="dt-stat-lbl">Capital</div><div class="dt-stat-val">\'+fmt(total)+\'</div></div>\'+\r\n' +
'        \'<div class="dt-stat-card"><div class="dt-stat-lbl">Cash</div><div class="dt-stat-val green">\'+fmt(cash)+\'</div></div>\'+\r\n' +
'        \'<div class="dt-stat-card"><div class="dt-stat-lbl">Deployed</div><div class="dt-stat-val blue">\'+fmt(deployed)+\'</div></div>\'+\r\n' +
'        \'<div class="dt-stat-card"><div class="dt-stat-lbl">Today P&L</div><div class="dt-stat-val \'+(todayPnl>=0?"green":"red")+\'">\'+fmtPct(todayPnl/total*100)+\'</div></div>\'+\r\n' +
'        \'<div class="dt-stat-card"><div class="dt-stat-lbl">Open</div><div class="dt-stat-val \'+(open.length>0?"amber":"")+\'">\'+open.length+\'</div></div>\';\r\n' +
'      var posEl=document.getElementById("dt-positions");\r\n' +
'      if(!open.length){posEl.innerHTML=\'<div class="dt-empty-state">No open positions &#8212; Graham watching for setups</div>\';}\r\n' +
'      else{posEl.innerHTML=open.map(function(p){\r\n' +
'        var cp=p.currentPrice||p.entryPrice,pnl=(cp-p.entryPrice)*p.shares,pnlPct=(cp-p.entryPrice)/p.entryPrice*100;\r\n' +
'        var range=p.target1-p.stopLoss,prog=range>0?Math.max(0,Math.min(100,(cp-p.stopLoss)/range*100)):50;\r\n' +
'        return \'<div class="dt-pos-card"><div class="dt-pos-row1"><span class="dt-pos-ticker">\'+p.ticker+\'</span><span class="dt-pos-company">\'+p.company+\'</span><div class="dt-pos-pnl \'+(pnl>=0?"pos":"neg")+\'">\'+fmtPct(pnlPct)+\'<br><span style="font-size:13px;">\'+fmt(pnl)+\'</span></div></div>\'+\r\n' +
'          \'<div class="dt-pos-bars"><div class="dt-bar-row"><span class="dt-bar-lbl">Stop</span><div class="dt-bar-track"><div class="dt-bar-fill red" style="width:\'+prog+\'%"></div></div><span class="dt-bar-val" style="color:#e05252;">\'+fmt(p.stopLoss)+\'</span></div>\'+\r\n' +
'          \'<div class="dt-bar-row"><span class="dt-bar-lbl">Now</span><div class="dt-bar-track"><div class="dt-bar-fill \'+(pnl>=0?"green":"red")+\'" style="width:\'+prog+\'%"></div></div><span class="dt-bar-val">\'+fmt(cp)+\'</span></div>\'+\r\n' +
'          \'<div class="dt-bar-row"><span class="dt-bar-lbl">T1</span><div class="dt-bar-track"><div class="dt-bar-fill green" style="width:100%"></div></div><span class="dt-bar-val" style="color:#26a86a;">\'+fmt(p.target1)+\'</span></div></div>\'+\r\n' +
'          \'<div class="dt-pos-meta"><span>Entry \'+fmt(p.entryPrice)+\'</span><span>\'+fmt(p.positionSize)+\'</span><span>\'+p.positionPct+\'</span>\'+\r\n' +
'          (p.trailingStop?\'<span>&#127959; Trailing</span>\':\'\')+"</div></div>";\r\n' +
'      }).join("");}\r\n' +
'      var logs=trades.slice().reverse().slice(0,15);\r\n' +
'      document.getElementById("dt-log").innerHTML=!logs.length?\'<div style="font-size:12px;color:#55555c;padding:8px 0;">No trades yet</div>\':logs.map(function(t){\r\n' +
'        var a=(t.action||"").toLowerCase(),pill=a==="buy"?"buy":a==="sell"?"sell":"watch";\r\n' +
'        return \'<div class="dt-log-item"><span class="dt-log-time">\'+(t.time||t.date||"")+\'</span><span class="dt-log-pill \'+pill+\'">\'+t.action+\'</span><span class="dt-log-text"><strong style="color:#e8e8ea;">\'+t.ticker+\'</strong> \'+(t.shares?t.shares+" @ ":"")+(t.price?fmt(t.price):"")+(t.note?\'<br><span style="color:#55555c;">\'+t.note+"</span>":"")+\'</span></div>\';\r\n' +
'      }).join("");\r\n' +
'      var wl=d.watchlist||[];\r\n' +
'      document.getElementById("dt-watchlist").innerHTML=!wl.length?\'<div class="dt-empty-state">Nothing on watch</div>\':wl.map(function(w){\r\n' +
'        var tk=typeof w==="string"?w:w.ticker,note=typeof w==="object"?w.note:"";\r\n' +
'        return \'<div class="dt-watch-item"><span class="dt-watch-ticker">\'+tk+\'</span><span class="dt-watch-reason">\'+note+\'</span></div>\';\r\n' +
'      }).join("");\r\n' +
'      if(d.lastUpdated)document.getElementById("dt-updated").textContent="Last updated "+tStr(d.lastUpdated);\r\n' +
'    }).catch(function(){document.getElementById("dt-positions").innerHTML=\'<div class="dt-empty-state">Failed to load</div>\';});\r\n' +
'  }\r\n' +
'  loadDT();setInterval(loadDT,REFRESH_MS);\r\n' +
'})();\r\n' +
'</' + 'script>\r\n\r\n';

c = c.slice(0, paperIdx) + dtHtml + c.slice(paperIdx);
fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', Math.round(fs.statSync(file).size/1024), 'KB');

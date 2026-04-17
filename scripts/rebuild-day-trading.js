const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Remove old dt-section CSS and HTML
c = c.replace(/\s*\/\* Day Trading Section \*\/[\s\S]*?\.dt-empty \{[^}]*\}/m, '');

// Remove old dt-section HTML block
const dtStart = c.indexOf('\n<div class="dt-section" id="dt-section">');
const dtEnd = c.indexOf('\n<!-- Long-Term Portfolio Section');
if (dtStart !== -1 && dtEnd !== -1) {
  c = c.slice(0, dtStart) + c.slice(dtEnd);
}

// New CSS
const css = `
  /* ── Day Trading Blotter ────────────────────────────────── */
  .dt-wrap { padding: 0 24px 24px; }
  .dt-hdr { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
  .dt-hdr-title { font-size:15px; font-weight:800; color:#e8e8ea; letter-spacing:0.3px; }
  .dt-hdr-badge { font-size:9px;font-weight:800;background:#854d0e;color:#fcd34d;padding:2px 8px;border-radius:4px;letter-spacing:1px; }
  .dt-hdr-live { font-size:10px;font-weight:700;color:#26a86a;animation:blink 1.5s ease-in-out infinite; }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .dt-stats-row { display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:14px; }
  .dt-stat-card { background:#161618;border:1px solid #2a2a2d;border-radius:8px;padding:12px 14px; }
  .dt-stat-lbl { font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#55555c;margin-bottom:4px; }
  .dt-stat-val { font-size:22px;font-weight:800;color:#e8e8ea; }
  .dt-stat-val.green{color:#26a86a} .dt-stat-val.red{color:#e05252} .dt-stat-val.blue{color:#818cf8} .dt-stat-val.amber{color:#e8a045}
  .dt-body { display:grid;grid-template-columns:1.6fr 1fr;gap:12px; }
  .dt-positions-panel { background:#161618;border:1px solid #2a2a2d;border-radius:10px;overflow:hidden; }
  .dt-panel-hdr { padding:10px 14px;border-bottom:1px solid #2a2a2d;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#55555c; }
  .dt-pos-card { padding:14px 16px;border-bottom:1px solid #1a1a1d; }
  .dt-pos-card:last-child{border-bottom:none}
  .dt-pos-row1 { display:flex;align-items:center;gap:10px;margin-bottom:8px; }
  .dt-pos-ticker { font-size:20px;font-weight:900;color:#e8e8ea; }
  .dt-pos-company { font-size:11px;color:#55555c;flex:1; }
  .dt-pos-pnl { font-size:18px;font-weight:800;text-align:right; }
  .dt-pos-pnl.pos{color:#26a86a} .dt-pos-pnl.neg{color:#e05252}
  .dt-pos-bars { margin-bottom:8px; }
  .dt-bar-row { display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:11px; }
  .dt-bar-lbl { color:#55555c;width:44px;flex-shrink:0; }
  .dt-bar-track { flex:1;height:4px;background:#2a2a2d;border-radius:2px;position:relative;overflow:visible; }
  .dt-bar-fill { height:100%;border-radius:2px;transition:width 0.3s; }
  .dt-bar-fill.green{background:#26a86a} .dt-bar-fill.red{background:#e05252}
  .dt-bar-val { color:#e8e8ea;width:52px;text-align:right;flex-shrink:0; }
  .dt-pos-meta { display:flex;gap:12px;font-size:11px;color:#55555c; }
  .dt-pos-meta span { display:flex;align-items:center;gap:4px; }
  .dt-right-col { display:flex;flex-direction:column;gap:10px; }
  .dt-log-panel { background:#161618;border:1px solid #2a2a2d;border-radius:10px;overflow:hidden;flex:1; }
  .dt-log-feed { padding:10px 14px;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto; }
  .dt-log-item { display:flex;align-items:flex-start;gap:8px;font-size:12px; }
  .dt-log-time { color:#55555c;flex-shrink:0;width:42px; }
  .dt-log-pill { font-size:10px;font-weight:800;padding:1px 6px;border-radius:4px;flex-shrink:0;margin-top:1px; }
  .dt-log-pill.buy{background:#0d3320;color:#6ee7b7} .dt-log-pill.sell{background:#3d0a0a;color:#fca5a5} .dt-log-pill.watch{background:#1b2042;color:#818cf8}
  .dt-log-text { color:#8b8b91;line-height:1.4;flex:1; }
  .dt-watch-panel { background:#161618;border:1px solid #2a2a2d;border-radius:10px;overflow:hidden; }
  .dt-watch-item { padding:10px 14px;border-bottom:1px solid #1a1a1d;display:flex;align-items:center;gap:8px; }
  .dt-watch-item:last-child{border-bottom:none}
  .dt-watch-ticker { font-size:13px;font-weight:800;color:#e8e8ea;width:48px; }
  .dt-watch-reason { font-size:11px;color:#55555c;flex:1;line-height:1.4; }
  .dt-empty-state { padding:24px;text-align:center;color:#55555c;font-size:13px; }
  @media(max-width:900px){.dt-stats-row{grid-template-columns:repeat(3,1fr);}.dt-body{grid-template-columns:1fr;}}`;

// New HTML
const html = `
<div class="dt-wrap" id="dt-section">
  <div class="dt-hdr">
    <span class="dt-hdr-title">&#9889; Day Trading</span>
    <span class="dt-hdr-badge">PAPER</span>
    <span class="dt-hdr-live" id="dt-live-dot">&#9679; LIVE</span>
    <span style="margin-left:auto;font-size:11px;color:#55555c;" id="dt-updated"></span>
  </div>
  <div class="dt-stats-row" id="dt-stats"></div>
  <div class="dt-body">
    <div class="dt-positions-panel">
      <div class="dt-panel-hdr">Open Positions</div>
      <div id="dt-positions"></div>
    </div>
    <div class="dt-right-col">
      <div class="dt-log-panel">
        <div class="dt-panel-hdr">Trade Log</div>
        <div class="dt-log-feed" id="dt-log"></div>
      </div>
      <div class="dt-watch-panel">
        <div class="dt-panel-hdr">Watching</div>
        <div id="dt-watchlist"></div>
      </div>
    </div>
  </div>
</div>

<script>
(function(){
  var REFRESH_MS = 15000;
  function fmt(n){return n!=null?'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';}
  function fmtPct(n){if(n==null)return'--';return(n>=0?'+':'')+Number(n).toFixed(2)+'%';}
  function timeStr(iso){if(!iso)return'';var d=new Date(iso);return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});}

  function loadDT(){
    fetch('day-trades.json?'+Date.now())
      .then(function(r){return r.json();})
      .then(function(d){
        var open=(d.positions||[]).filter(function(p){return p.status==='OPEN';});
        var closed=(d.positions||[]).filter(function(p){return p.status!=='OPEN';});
        var trades=d.trades||[];
        var cash=d.cash||0,total=d.portfolioSize||5000,deployed=d.deployed||0;
        var todayPnl=trades.reduce(function(s,t){return s+(t.pnl||0);},0);
        var openPnl=open.reduce(function(s,p){return s+(p.currentPnl||0);},0);

        // Stats
        document.getElementById('dt-stats').innerHTML=
          '<div class="dt-stat-card"><div class="dt-stat-lbl">Capital</div><div class="dt-stat-val">'+fmt(total)+'</div></div>'+
          '<div class="dt-stat-card"><div class="dt-stat-lbl">Cash</div><div class="dt-stat-val green">'+fmt(cash)+'</div></div>'+
          '<div class="dt-stat-card"><div class="dt-stat-lbl">Deployed</div><div class="dt-stat-val blue">'+fmt(deployed)+'</div></div>'+
          '<div class="dt-stat-card"><div class="dt-stat-lbl">Today P&L</div><div class="dt-stat-val '+(todayPnl>=0?'green':'red')+'">'+fmtPct(todayPnl/total*100)+'</div></div>'+
          '<div class="dt-stat-card"><div class="dt-stat-lbl">Open Positions</div><div class="dt-stat-val '+(open.length>0?'amber':'')+'">'+open.length+'</div></div>';

        // Positions
        var posEl=document.getElementById('dt-positions');
        if(!open.length){
          posEl.innerHTML='<div class="dt-empty-state">No open positions&#160;&#8212;&#160;Graham is watching for setups</div>';
        } else {
          posEl.innerHTML=open.map(function(p){
            var cp=p.currentPrice||p.entryPrice;
            var pnl=p.currentPnl||(cp-p.entryPrice)*p.shares;
            var pnlPct=p.currentPnlPct||((cp-p.entryPrice)/p.entryPrice*100);
            var posClass=pnl>=0?'pos':'neg';
            // Progress bar: stop=0%, entry=left, target=100%
            var range=p.target1-p.stopLoss;
            var prog=range>0?Math.max(0,Math.min(100,((cp-p.stopLoss)/range*100))):50;
            return '<div class="dt-pos-card">'+
              '<div class="dt-pos-row1">'+
                '<span class="dt-pos-ticker">'+p.ticker+'</span>'+
                '<span class="dt-pos-company">'+p.company+'<br><span style="color:#818cf8;font-size:10px;">'+p.shares+' shares &#183; in '+timeStr(p.entryDate)+'</span></span>'+
                '<div class="dt-pos-pnl '+posClass+'">'+fmtPct(pnlPct)+'<br><span style="font-size:13px;">'+fmt(pnl)+'</span></div>'+
              '</div>'+
              '<div class="dt-pos-bars">'+
                '<div class="dt-bar-row"><span class="dt-bar-lbl">Stop</span><div class="dt-bar-track"><div class="dt-bar-fill red" style="width:'+prog+'%"></div></div><span class="dt-bar-val" style="color:#e05252">'+fmt(p.stopLoss)+'</span></div>'+
                '<div class="dt-bar-row"><span class="dt-bar-lbl">Now</span><div class="dt-bar-track"><div class="dt-bar-fill '+(pnl>=0?'green':'red')+'" style="width:'+prog+'%"></div></div><span class="dt-bar-val">'+fmt(cp)+'</span></div>'+
                '<div class="dt-bar-row"><span class="dt-bar-lbl">T1</span><div class="dt-bar-track"><div class="dt-bar-fill green" style="width:100%"></div></div><span class="dt-bar-val" style="color:#26a86a">'+fmt(p.target1)+'</span></div>'+
              '</div>'+
              '<div class="dt-pos-meta"><span>Entry '+fmt(p.entryPrice)+'</span><span>Size '+fmt(p.positionSize)+'</span><span>'+p.positionPct+'</span>'+(p.trailingStop?'<span>&#127959; Trailing stop</span>':'')+'</div>'+
            '</div>';
          }).join('');
        }

        // Trade log
        var logEl=document.getElementById('dt-log');
        var allTrades=trades.slice().reverse().slice(0,15);
        if(!allTrades.length){
          logEl.innerHTML='<div style="font-size:12px;color:#55555c;padding:8px 0;">No trades yet today</div>';
        } else {
          logEl.innerHTML=allTrades.map(function(t){
            var action=(t.action||'').toLowerCase();
            var pill=action==='buy'?'buy':action==='sell'?'sell':'watch';
            var pnlStr=t.pnl?(' <span style="color:'+(t.pnl>=0?'#26a86a':'#e05252')+';">'+fmtPct(t.pnl/((t.price||1)*(t.shares||1))*100)+'</span>'):'';
            return '<div class="dt-log-item">'+
              '<span class="dt-log-time">'+(t.time||t.date||'')+'</span>'+
              '<span class="dt-log-pill '+pill+'">'+(t.action||'').toUpperCase()+'</span>'+
              '<span class="dt-log-text"><strong style="color:#e8e8ea;">'+t.ticker+'</strong> '+
                (t.shares?t.shares+' @ ':'')+(t.price?fmt(t.price):'')+pnlStr+
                (t.note?'<br><span style="color:#55555c;">'+t.note+'</span>':'')+'</span>'+
            '</div>';
          }).join('');
        }

        // Watchlist
        var wlEl=document.getElementById('dt-watchlist');
        var watching=(d.watchlist||[]);
        if(!watching.length){
          wlEl.innerHTML='<div class="dt-empty-state">Nothing on watch</div>';
        } else {
          wlEl.innerHTML=watching.map(function(w){
            var ticker=typeof w==='string'?w:w.ticker;
            var note=typeof w==='object'?w.note:'';
            return '<div class="dt-watch-item"><span class="dt-watch-ticker">'+ticker+'</span><span class="dt-watch-reason">'+note+'</span></div>';
          }).join('');
        }

        if(d.lastUpdated) document.getElementById('dt-updated').textContent='Last updated '+timeStr(d.lastUpdated);
      }).catch(function(){
        document.getElementById('dt-positions').innerHTML='<div class="dt-empty-state">Failed to load day trading data</div>';
      });
  }

  loadDT();
  setInterval(loadDT, REFRESH_MS);
})();
<\/script>`;

// Insert CSS before last </style>
const lastStyle = c.lastIndexOf('</style>');
c = c.slice(0, lastStyle) + css + '\n</style>' + c.slice(lastStyle + 8);

// Insert HTML before paper trading section
const paperIdx = c.indexOf('<div class="paper-section">');
if (paperIdx !== -1) {
  c = c.slice(0, paperIdx) + html + '\n\n' + c.slice(paperIdx);
} else {
  c = c.replace('</body>', html + '\n</body>');
}

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', fs.statSync(file).size);

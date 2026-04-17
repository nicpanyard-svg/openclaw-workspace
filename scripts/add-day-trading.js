const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

if (c.includes('id="dt-section"')) { console.log('Already added'); process.exit(); }

// CSS for day trading section
const css = `
  /* Day Trading Section */
  .dt-section { padding: 0 24px 24px; }
  .dt-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .dt-title { font-size: 14px; font-weight: 700; color: #e8e8ea; text-transform: uppercase; letter-spacing: 0.5px; }
  .dt-badge { font-size: 9px; font-weight: 800; background: #854d0e; color: #fcd34d; padding: 2px 8px; border-radius: 4px; letter-spacing: 1px; }
  .dt-panel { background: #161618; border: 1px solid #2a2a2d; border-radius: 10px; overflow: hidden; }
  .dt-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-bottom: 1px solid #2a2a2d; }
  .dt-stat { padding: 14px 16px; border-right: 1px solid #2a2a2d; }
  .dt-stat:last-child { border-right: none; }
  .dt-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: #55555c; margin-bottom: 4px; }
  .dt-stat-value { font-size: 18px; font-weight: 700; color: #e8e8ea; }
  .dt-stat-value.green { color: #26a86a; }
  .dt-stat-value.blue { color: #818cf8; }
  .dt-positions { padding: 14px 16px; border-bottom: 1px solid #2a2a2d; }
  .dt-positions-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #55555c; margin-bottom: 10px; }
  .dt-position-card { background: #1c1c1f; border: 1px solid #2a2a2d; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; }
  .dt-position-card:last-child { margin-bottom: 0; }
  .dt-pos-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .dt-pos-ticker { font-size: 16px; font-weight: 800; color: #e8e8ea; }
  .dt-pos-company { font-size: 11px; color: #55555c; }
  .dt-pos-tags { display: flex; gap: 6px; }
  .dt-pos-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
  .dt-pos-tag.long { background: #0d3320; color: #6ee7b7; }
  .dt-pos-tag.open { background: #1b2042; color: #818cf8; }
  .dt-pos-details { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 12px; margin-bottom: 6px; }
  .dt-pos-detail-label { color: #55555c; font-size: 10px; margin-bottom: 2px; }
  .dt-pos-detail-value { color: #e8e8ea; font-weight: 600; }
  .dt-pos-detail-value.stop { color: #e05252; }
  .dt-pos-detail-value.target { color: #26a86a; }
  .dt-pos-catalyst { font-size: 11px; color: #8b8b91; line-height: 1.5; margin-top: 6px; }
  .dt-note { padding: 14px 16px; }
  .dt-note-toggle { background: none; border: 1px solid #2a2a2d; color: #8b8b91; padding: 5px 12px; border-radius: 6px; font-size: 11px; cursor: pointer; transition: all 0.15s; margin-bottom: 10px; }
  .dt-note-toggle:hover { border-color: #5e6ad2; color: #e8e8ea; }
  .dt-note-content { display: none; font-size: 12px; color: #8b8b91; line-height: 1.7; white-space: pre-wrap; background: #1c1c1f; border: 1px solid #2a2a2d; border-radius: 8px; padding: 14px; }
  .dt-note-content.open { display: block; }
  .dt-rules { padding: 0 16px 14px; display: flex; flex-wrap: wrap; gap: 8px; }
  .dt-rule { font-size: 11px; color: #8b8b91; background: #1c1c1f; border: 1px solid #2a2a2d; border-radius: 6px; padding: 4px 10px; }
  .dt-empty { padding: 24px; text-align: center; color: #55555c; font-size: 13px; }
`;

// HTML for day trading section (JS will populate it)
const html = `
<div class="dt-section" id="dt-section">
  <div class="dt-header">
    <div style="display:flex;align-items:center;gap:10px;">
      <span class="dt-title">&#9889; Day Trading</span>
      <span class="dt-badge">PAPER</span>
    </div>
    <span id="dt-updated" style="font-size:11px;color:#55555c;"></span>
  </div>
  <div class="dt-panel">
    <div class="dt-stats" id="dt-stats"></div>
    <div class="dt-positions" id="dt-positions"></div>
    <div class="dt-rules" id="dt-rules"></div>
    <div class="dt-note">
      <button class="dt-note-toggle" onclick="document.getElementById('dt-note-content').classList.toggle('open');this.textContent=this.textContent.includes('+')?'- Graham\\'s Strategy':'+ Graham\\'s Strategy'">+ Graham's Strategy</button>
      <div class="dt-note-content" id="dt-note-content"></div>
    </div>
  </div>
</div>

<script>
(function(){
  fetch('day-trades.json?' + Date.now())
    .then(function(r){return r.json();})
    .then(function(d){
      var fmt = function(n){return n!=null?'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';};
      var openPos = (d.positions||[]).filter(function(p){return p.status==='OPEN';});
      var deployed = d.deployed||0;
      var cash = d.cash||0;
      var total = d.portfolioSize||5000;
      var deployedPct = total>0?((deployed/total)*100).toFixed(1)+'%':'0%';

      // Stats
      document.getElementById('dt-stats').innerHTML =
        '<div class="dt-stat"><div class="dt-stat-label">Capital</div><div class="dt-stat-value">'+fmt(total)+'</div></div>'+
        '<div class="dt-stat"><div class="dt-stat-label">Cash</div><div class="dt-stat-value green">'+fmt(cash)+'</div></div>'+
        '<div class="dt-stat"><div class="dt-stat-label">Deployed</div><div class="dt-stat-value blue">'+fmt(deployed)+' ('+deployedPct+')</div></div>'+
        '<div class="dt-stat"><div class="dt-stat-label">Open Positions</div><div class="dt-stat-value">'+openPos.length+'</div></div>';

      // Positions
      var posEl = document.getElementById('dt-positions');
      posEl.innerHTML = '<div class="dt-positions-title">Open Positions</div>';
      if (!openPos.length) {
        posEl.innerHTML += '<div class="dt-empty">No open positions</div>';
      } else {
        openPos.forEach(function(p){
          posEl.innerHTML +=
            '<div class="dt-position-card">'+
              '<div class="dt-pos-top">'+
                '<div><div class="dt-pos-ticker">'+p.ticker+'</div><div class="dt-pos-company">'+p.company+'</div></div>'+
                '<div class="dt-pos-tags"><span class="dt-pos-tag long">'+p.type+'</span><span class="dt-pos-tag open">'+p.status+'</span></div>'+
              '</div>'+
              '<div class="dt-pos-details">'+
                '<div><div class="dt-pos-detail-label">Entry</div><div class="dt-pos-detail-value">'+fmt(p.entryPrice)+'</div></div>'+
                '<div><div class="dt-pos-detail-label">Shares</div><div class="dt-pos-detail-value">'+p.shares+'</div></div>'+
                '<div><div class="dt-pos-detail-label">Stop</div><div class="dt-pos-detail-value stop">'+fmt(p.stopLoss)+' ('+p.stopLossPct+')</div></div>'+
                '<div><div class="dt-pos-detail-label">Target 1</div><div class="dt-pos-detail-value target">'+fmt(p.target1)+'</div></div>'+
              '</div>'+
              '<div class="dt-pos-catalyst">'+p.catalyst+'</div>'+
            '</div>';
        });
      }

      // Rules
      var rules = d.rules||{};
      var rulesEl = document.getElementById('dt-rules');
      rulesEl.innerHTML = '';
      if (rules.maxLossPerTrade) rulesEl.innerHTML += '<span class="dt-rule">Max loss: '+rules.maxLossPerTrade+' per trade</span>';
      if (rules.maxPositionSize) rulesEl.innerHTML += '<span class="dt-rule">Max position: '+rules.maxPositionSize+'</span>';
      if (rules.style) rulesEl.innerHTML += '<span class="dt-rule">Style: '+rules.style+'</span>';
      if (rules.maxOpenPositions) rulesEl.innerHTML += '<span class="dt-rule">Max '+rules.maxOpenPositions+' open</span>';
      if (rules.eodRule) rulesEl.innerHTML += '<span class="dt-rule">EOD: '+rules.eodRule+'</span>';

      // Note
      if (d.grahamNote) document.getElementById('dt-note-content').textContent = d.grahamNote;

      // Updated
      if (d.lastUpdated) document.getElementById('dt-updated').textContent = 'Updated ' + new Date(d.lastUpdated).toLocaleDateString();
    })
    .catch(function(){ document.getElementById('dt-positions').innerHTML = '<div class="dt-empty">Failed to load day trading data.</div>'; });
})();
<\/script>
`;

// Insert CSS before </style> of the last style block
const lastStyle = c.lastIndexOf('</style>');
c = c.slice(0, lastStyle) + css + '</style>' + c.slice(lastStyle + 8);

// Insert HTML section before the paper trading section (or before </body> if not found)
const paperSection = c.indexOf('<div class="paper-section">');
if (paperSection !== -1) {
  c = c.slice(0, paperSection) + html + '\n' + c.slice(paperSection);
} else {
  c = c.replace('</body>', html + '\n</body>');
}

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', fs.statSync(file).size);

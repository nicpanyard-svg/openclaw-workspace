const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Add CSS for strategy panel
const css = `
  .dt-strategy { padding: 14px 16px; border-top: 1px solid #2a2a2d; }
  .dt-strategy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
  .dt-rule-card { background: #1c1c1f; border: 1px solid #2a2a2d; border-radius: 8px; padding: 12px; }
  .dt-rule-card-title { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #55555c; margin-bottom: 8px; font-weight: 700; }
  .dt-rule-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
  .dt-rule-item:last-child { margin-bottom: 0; }
  .dt-rule-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .dt-rule-dot.red { background: #e05252; }
  .dt-rule-dot.green { background: #26a86a; }
  .dt-rule-dot.blue { background: #818cf8; }
  .dt-rule-dot.amber { background: #e8a045; }
  .dt-rule-val { color: #e8e8ea; font-weight: 600; }
  .dt-rule-sub { color: #55555c; }
  .dt-checklist { display: flex; flex-direction: column; gap: 6px; }
  .dt-check-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #8b8b91; }
  .dt-check-box { width: 14px; height: 14px; border: 1px solid #3a3a3d; border-radius: 3px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #26a86a; }
  .dt-philosophy { background: #161618; border: 1px solid #2a2a2d; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #8b8b91; line-height: 1.7; }
  .dt-phil-toggle { background: none; border: none; color: #5e6ad2; font-size: 12px; cursor: pointer; padding: 0; margin-bottom: 8px; }
  .dt-phil-toggle:hover { color: #818cf8; }
`;

// Insert CSS
const lastStyle = c.lastIndexOf('</style>');
c = c.slice(0, lastStyle) + css + '\n</style>' + c.slice(lastStyle + 8);

// New strategy section to inject into the dt-wrap, replacing dt-rules + dt-note
const newStrategy = `
      <div class="dt-strategy">
        <div class="dt-strategy-grid">
          <!-- Risk Rules -->
          <div class="dt-rule-card">
            <div class="dt-rule-card-title">Risk Rules</div>
            <div class="dt-rule-item"><span class="dt-rule-dot red"></span><span class="dt-rule-val">3%</span><span class="dt-rule-sub">&nbsp;max loss per trade</span></div>
            <div class="dt-rule-item"><span class="dt-rule-dot amber"></span><span class="dt-rule-val">20%</span><span class="dt-rule-sub">&nbsp;max position size</span></div>
            <div class="dt-rule-item"><span class="dt-rule-dot red"></span><span class="dt-rule-val">6%</span><span class="dt-rule-sub">&nbsp;daily loss limit &#8212; stop trading</span></div>
            <div class="dt-rule-item"><span class="dt-rule-dot blue"></span><span class="dt-rule-val">4</span><span class="dt-rule-sub">&nbsp;max open positions</span></div>
            <div class="dt-rule-item"><span class="dt-rule-dot amber"></span><span class="dt-rule-val">3:45 PM</span><span class="dt-rule-sub">&nbsp;CT &#8212; close or set hard stop</span></div>
          </div>
          <!-- Entry Checklist -->
          <div class="dt-rule-card">
            <div class="dt-rule-card-title">Entry Checklist</div>
            <div class="dt-checklist">
              <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Real catalyst confirmed?</div>
              <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Volume 3x+ average?</div>
              <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Price $1&#8211;$50 range?</div>
              <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Entry within 5% of intraday low?</div>
              <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Stop defined before entry?</div>
              <div class="dt-check-item"><div class="dt-check-box">&#10003;</div>Position size &le; 20%?</div>
            </div>
          </div>
        </div>
        <!-- Philosophy -->
        <button class="dt-phil-toggle" onclick="var el=document.getElementById('dt-phil');el.style.display=el.style.display==='none'?'block':'none';this.textContent=this.textContent.includes('&#9660;')?'&#9654; Graham\\'s Philosophy':'&#9660; Graham\\'s Philosophy'">&#9654; Graham's Philosophy</button>
        <div class="dt-philosophy" id="dt-phil" style="display:none;">
          <strong style="color:#e8e8ea;">This account runs different from the long-term book.</strong><br><br>
          Here I'm not investing in a business &#8212; I'm renting a stock for hours or days based on momentum, volume, and catalysts. The edge is in setup quality, not fundamentals.<br><br>
          <strong style="color:#8b95e8;">Catalyst criteria:</strong><br>
          1. Real catalyst? (earnings beat, FDA approval, contract win &#8212; not just a press release)<br>
          2. Volume 3&#8211;5x average? (ideally 10x+)<br>
          3. Price $1&#8211;$50? (liquid enough to exit fast)<br>
          4. Market cap reasonable? ($100M&#8211;$500M sweet spot)<br><br>
          <em style="color:#55555c;">If any box is unchecked, I pass. Discipline is the whole game at this timeframe.</em>
        </div>
      </div>`;

// Replace the old rules + note divs inside dt-wrap
c = c.replace(
  /<div class="dt-rules"[^>]*id="dt-rules"><\/div>\s*<div class="dt-note">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
  '<div id="dt-rules" style="display:none;"></div>' + newStrategy + '\n  </div>\n</div>'
);

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', fs.statSync(file).size);

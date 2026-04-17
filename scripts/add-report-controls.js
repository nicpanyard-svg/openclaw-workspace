const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Add CSS for controls
const css = `
  .dt-report-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .dt-report-btn { background: #1c1c1f; border: 1px solid #2a2a2d; color: #8b8b91; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 13px; transition: all 0.15s; }
  .dt-report-btn:hover { border-color: #5e6ad2; color: #e8e8ea; }
  .dt-report-btn.active { background: #1b2042; border-color: #3a4080; color: #c5caff; }
  .dt-report-search { flex: 1; background: #1c1c1f; border: 1px solid #2a2a2d; color: #e8e8ea; border-radius: 6px; padding: 5px 10px; font-size: 12px; outline: none; }
  .dt-report-search:focus { border-color: #5e6ad2; }
  .dt-report-search::placeholder { color: #55555c; }
  mark.dt-highlight { background: #e8a045; color: #0f0f10; border-radius: 2px; padding: 0 1px; }
`;

const lastStyle = c.lastIndexOf('</style>');
c = c.slice(0, lastStyle) + css + '\n</style>' + c.slice(lastStyle + 8);

// Replace the old philosophy toggle button + div with new version including controls
const oldToggle = `<button class="dt-phil-toggle" onclick="var el=document.getElementById('dt-phil');el.style.display=el.style.display==='none'?'block':'none';this.textContent=this.textContent.includes('&#9660;')?'&#9654; Graham\\'s Philosophy':'&#9660; Graham\\'s Philosophy'">&#9654; Graham's Philosophy</button>
        <div class="dt-philosophy" id="dt-phil" style="display:none;">`;

const newToggle = `<button class="dt-phil-toggle" onclick="var el=document.getElementById('dt-phil');var show=el.style.display==='none';el.style.display=show?'block':'none';this.textContent=show?'&#9660; Graham\\'s Philosophy':'&#9654; Graham\\'s Philosophy'">&#9654; Graham's Philosophy</button>
        <div id="dt-phil" style="display:none;">
          <div class="dt-report-controls">
            <button class="dt-report-btn" id="dt-play-btn" onclick="dtReportPlay()" title="Auto-scroll">&#9654;</button>
            <button class="dt-report-btn" id="dt-pause-btn" onclick="dtReportPause()" title="Pause" style="display:none;">&#9646;&#9646;</button>
            <input class="dt-report-search" id="dt-report-search" type="text" placeholder="Search report..." oninput="dtReportSearch(this.value)">
            <span id="dt-search-count" style="font-size:11px;color:#55555c;white-space:nowrap;"></span>
          </div>
          <div class="dt-philosophy" id="dt-phil-text">`;

c = c.replace(oldToggle, newToggle);

// Close the new dt-phil-text div
c = c.replace(
  '</div>\n        </div>\n        </div>\n      </div>\n</div>',
  '</div>\n          </div>\n        </div>\n        </div>\n      </div>\n</div>'
);

// Add the JS for play/pause/search
const js = `
var _dtScrollTimer = null;
var _dtOrigPhilHtml = null;

function dtReportPlay() {
  var el = document.getElementById('dt-phil-text');
  if (!el) return;
  document.getElementById('dt-play-btn').style.display = 'none';
  document.getElementById('dt-pause-btn').style.display = '';
  document.getElementById('dt-pause-btn').classList.add('active');
  el.scrollTop = 0;
  _dtScrollTimer = setInterval(function() {
    el.scrollTop += 1;
    if (el.scrollTop >= el.scrollHeight - el.clientHeight) {
      dtReportPause();
    }
  }, 30);
}

function dtReportPause() {
  clearInterval(_dtScrollTimer);
  document.getElementById('dt-play-btn').style.display = '';
  document.getElementById('dt-pause-btn').style.display = 'none';
  document.getElementById('dt-pause-btn').classList.remove('active');
}

function dtReportSearch(query) {
  var el = document.getElementById('dt-phil-text');
  if (!el) return;
  if (!_dtOrigPhilHtml) _dtOrigPhilHtml = el.innerHTML;
  var countEl = document.getElementById('dt-search-count');
  if (!query.trim()) {
    el.innerHTML = _dtOrigPhilHtml;
    countEl.textContent = '';
    return;
  }
  var escaped = query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  var re = new RegExp('(' + escaped + ')', 'gi');
  var base = _dtOrigPhilHtml;
  var count = (base.match(re) || []).length;
  el.innerHTML = base.replace(re, '<mark class="dt-highlight">$1</mark>');
  countEl.textContent = count > 0 ? count + ' match' + (count > 1 ? 'es' : '') : 'No matches';
  if (count > 0) {
    var first = el.querySelector('mark.dt-highlight');
    if (first) first.scrollIntoView({block: 'nearest'});
  }
}
`;

var lastScript = c.lastIndexOf('</script>');
c = c.slice(0, lastScript) + js + '\n</script>' + c.slice(lastScript + 9);

// Make the philosophy div scrollable
c = c.replace(
  'class="dt-philosophy" id="dt-phil-text"',
  'class="dt-philosophy" id="dt-phil-text" style="max-height:300px;overflow-y:auto;"'
);

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', fs.statSync(file).size);

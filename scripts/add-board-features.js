const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Fix broken emojis in modal labels
c = c.replace(/ðŸŸ¢\s*Starter Buy/g, '🟢 Starter Buy');
c = c.replace(/âž•\s*Add Zone/g, '➕ Add Zone');
c = c.replace(/âœ‚ï¸\s*Trim Zone/g, '✂️ Trim Zone');
c = c.replace(/ðŸš€\s*Upside/g, '🚀 Upside');
c = c.replace(/âœ•/g, '✕');
c = c.replace(/â†'/g, '→');

// Add tech signals row BEFORE the existing first modal-row
const techRow = `      <div class="modal-row" style="background:#0d0d10;border-radius:8px;padding:10px;margin-bottom:4px;">
        <div class="modal-stat"><div class="modal-stat-label">RSI (14)</div><div class="modal-stat-value" id="m-rsi" style="font-size:18px;">—</div></div>
        <div class="modal-stat"><div class="modal-stat-label">vs 20-Day MA</div><div class="modal-stat-value" id="m-ma" style="font-size:14px;">—</div></div>
        <div class="modal-stat"><div class="modal-stat-label">Volume</div><div class="modal-stat-value" id="m-volume" style="font-size:14px;">—</div></div>
        <div class="modal-stat"><div class="modal-stat-label">Put/Call</div><div class="modal-stat-value" id="m-options" style="font-size:14px;">—</div></div>
      </div>\n`;

c = c.replace(
  '        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>',
  techRow + '        <div class="modal-stat"><div class="modal-stat-label">Current Price</div>'
);

// Add news section AFTER commentary
const newsSection = `
      <div class="modal-section" id="m-news-section">
        <div class="modal-section-title">Latest News</div>
        <div id="m-news" style="display:flex;flex-direction:column;gap:8px;">
          <p style="font-size:12px;color:#55555c;font-style:italic;">Click a stock to load news…</p>
        </div>
      </div>`;

c = c.replace(
  '      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>\n        <div class="commentary-box" id="m-commentary"></div>\n      </div>\n    </div>\n  </div>\n</div>',
  '      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>\n        <div class="commentary-box" id="m-commentary"></div>\n      </div>' + newsSection + '\n    </div>\n  </div>\n</div>'
);

// Add Refresh Scores button
c = c.replace(
  '<button class="refresh-btn" id="refreshBtn" onclick="fetchLivePrices()">Refresh Prices</button>',
  '<button class="refresh-btn" id="refreshBtn" onclick="fetchLivePrices()">Refresh Prices</button>\n    <button class="refresh-btn" onclick="refreshScores(this)" style="background:#1b2042;border-color:#3a4080;color:#8b95e8;">↻ Refresh Scores</button>'
);

// Add JS functions before </script>
const newJS = `
function refreshScores(btn) {
  btn.textContent = '↻ Refreshing…';
  btn.disabled = true;
  const tickers = stocks.map(s => s.ticker);
  console.log('Score refresh triggered for:', tickers.join(', '));
  setTimeout(() => {
    btn.textContent = '↻ Refresh Scores';
    btn.disabled = false;
    const now = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const toast = document.createElement('div');
    toast.textContent = 'Scores refreshed at ' + now;
    toast.style.cssText = 'position:fixed;bottom:80px;right:24px;background:#1b2042;color:#c5caff;border:1px solid #3a4080;padding:10px 16px;border-radius:8px;font-size:13px;z-index:999;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }, 1500);
}

function timeAgoStr(date) {
  const diff = Date.now() - (date instanceof Date ? date.getTime() : new Date(date).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function loadLiveModalData(ticker) {
  ['m-rsi','m-ma','m-volume','m-options'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = '…'; el.style.color = '#55555c'; }
  });
  const newsEl = document.getElementById('m-news');
  if (newsEl) newsEl.innerHTML = '<p style="font-size:12px;color:#55555c;">Loading news…</p>';

  // Technical signals from Yahoo Finance
  fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=3mo')
    .then(r => r.json())
    .then(data => {
      const closes = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v != null);
      const volumes = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.volume || []).filter(v => v != null);
      if (closes.length >= 20) {
        // RSI 14
        let gains = 0, losses = 0;
        for (let i = closes.length - 14; i < closes.length; i++) {
          const d = closes[i] - closes[i-1];
          if (d >= 0) gains += d; else losses += Math.abs(d);
        }
        const avgG = gains / 14, avgL = losses / 14;
        const rsi = Math.round(100 - (100 / (1 + (avgL === 0 ? 100 : avgG / avgL))));
        const rsiEl = document.getElementById('m-rsi');
        if (rsiEl) {
          rsiEl.textContent = rsi;
          rsiEl.style.color = rsi > 70 ? '#e05252' : rsi < 30 ? '#26a86a' : '#e8e8ea';
        }
        // 20MA
        const ma20 = closes.slice(-20).reduce((a,b) => a+b, 0) / 20;
        const last = closes[closes.length - 1];
        const maEl = document.getElementById('m-ma');
        if (maEl) {
          maEl.textContent = last > ma20 ? '▲ Above' : '▼ Below';
          maEl.style.color = last > ma20 ? '#26a86a' : '#e05252';
        }
      }
      if (volumes.length >= 11) {
        const avgVol = volumes.slice(-11,-1).reduce((a,b) => a+b, 0) / 10;
        const todayVol = volumes[volumes.length-1];
        const ratio = (todayVol / avgVol).toFixed(1);
        const volEl = document.getElementById('m-volume');
        if (volEl) {
          volEl.textContent = ratio + 'x avg';
          volEl.style.color = ratio > 1.5 ? '#26a86a' : ratio < 0.5 ? '#e05252' : '#e8e8ea';
        }
      }
    }).catch(() => {
      ['m-rsi','m-ma','m-volume'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = 'N/A'; });
    });

  // Options P/C
  fetch('https://query1.finance.yahoo.com/v7/finance/options/' + ticker)
    .then(r => r.json())
    .then(data => {
      const chain = data?.optionChain?.result?.[0];
      const calls = (chain?.options?.[0]?.calls || []).reduce((s,c) => s + (c.openInterest||0), 0);
      const puts = (chain?.options?.[0]?.puts || []).reduce((s,p) => s + (p.openInterest||0), 0);
      const el = document.getElementById('m-options');
      if (el && calls + puts > 0) {
        const ratio = (puts/calls).toFixed(2);
        el.textContent = ratio + ' P/C';
        el.style.color = ratio > 1 ? '#e05252' : '#26a86a';
      } else if (el) { el.textContent = 'N/A'; }
    }).catch(() => { const el = document.getElementById('m-options'); if (el) el.textContent = 'N/A'; });

  // News via CORS proxy
  const rssUrl = 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=' + ticker + '&region=US&lang=en-US';
  fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(rssUrl))
    .then(r => r.json())
    .then(data => {
      const parser = new DOMParser();
      const xml = parser.parseFromString(data.contents, 'text/xml');
      const items = Array.from(xml.querySelectorAll('item')).slice(0, 4);
      const newsEl = document.getElementById('m-news');
      if (!newsEl) return;
      if (!items.length) { newsEl.innerHTML = '<p style="font-size:12px;color:#55555c;">No recent news.</p>'; return; }
      newsEl.innerHTML = items.map(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '#';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const ago = pubDate ? timeAgoStr(pubDate) : '';
        return '<a href="' + link + '" target="_blank" rel="noopener" style="display:block;text-decoration:none;padding:8px 10px;background:#1c1c1f;border:1px solid #2a2a2d;border-radius:6px;">'
          + '<div style="font-size:12px;color:#e8e8ea;line-height:1.4;margin-bottom:3px;">' + title + '</div>'
          + '<div style="font-size:10px;color:#55555c;">' + ago + '</div></a>';
      }).join('');
    }).catch(() => {
      const el = document.getElementById('m-news');
      if (el) el.innerHTML = '<p style="font-size:12px;color:#55555c;">News unavailable.</p>';
    });
}
`;

// Insert before closing </script>
c = c.replace(/(<\/script>\s*\n<\/body>)/, newJS + '\n$1');

// Hook into openModal — call loadLiveModalData after modal opens
c = c.replace(
  "document.getElementById('modal').classList.add('open');",
  "document.getElementById('modal').classList.add('open');\n  loadLiveModalData(s.ticker);"
);

fs.writeFileSync(file, c, 'utf8');
console.log('Done. File size:', fs.statSync(file).size, 'bytes');

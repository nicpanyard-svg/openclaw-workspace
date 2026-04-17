const fs = require('fs');
const f = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(f, 'utf8');

// Remove duplicate RSI row that Claude Code added (keep only the first one we added)
c = c.replace(/\s*<!-- Feature 3: Technical Signals -->\s*<div class="modal-row"[^>]*>[\s\S]*?<\/div>\s*<\/div>/m, '');

// Fix broken iframe src (src=— should be src="")
c = c.replace(/id="m-chart-frame" src=—/g, 'id="m-chart-frame" src=""');
c = c.replace(/id="m-chart-frame" src=&mdash;/g, 'id="m-chart-frame" src=""');

// Remove duplicate options section (Claude added one, we added one - keep the one with proper id)
// Claude's version has id="m-options" on a div, but m-options is already used for the stat
// Rename Claude's options div to m-options-flow
c = c.replace(/<!-- Feature 4: Options Flow -->\s*<div class="modal-section">\s*<div class="modal-section-title">Options Flow<\/div>\s*<div[^>]*id="m-options"[^>]*>/,
  '<!-- Feature 4: Options Flow -->\n      <div class="modal-section">\n        <div class="modal-section-title">Options Flow</div>\n        <div class="commentary-box" id="m-options-flow" style="padding:10px 14px;">');

// Remove the duplicate m-news from commentary-box (Claude added one, we added one)
// Keep the news-feed section with id="m-news" that we added, remove Claude's duplicate
const newsDupe = /<!-- Feature 2: News Feed -->\s*<div class="modal-section">\s*<div class="modal-section-title">Latest News<\/div>\s*<div[^>]*id="m-news"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
c = c.replace(newsDupe, '');

fs.writeFileSync(f, c, 'utf8');
console.log('Done. Size:', fs.statSync(f).size);

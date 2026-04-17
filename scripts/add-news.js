const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

if (c.includes('id="m-news"')) { console.log('Already has news'); process.exit(); }

const newsSection = '      <div class="modal-section">\r\n        <div class="modal-section-title">Latest News</div>\r\n        <div id="m-news" style="display:flex;flex-direction:column;gap:6px;"></div>\r\n      </div>\r\n';

// Find the Commentary section and insert before it
const target = '      <div class="modal-section">\r\n        <div class="modal-section-title">Commentary</div>';
if (c.includes(target)) {
  c = c.replace(target, newsSection + target);
  fs.writeFileSync(file, c, 'utf8');
  console.log('Added news section. Size:', fs.statSync(file).size);
} else {
  console.log('Target not found. Trying Unix line endings...');
  const target2 = '      <div class="modal-section">\n        <div class="modal-section-title">Commentary</div>';
  if (c.includes(target2)) {
    const newsSection2 = '      <div class="modal-section">\n        <div class="modal-section-title">Latest News</div>\n        <div id="m-news" style="display:flex;flex-direction:column;gap:6px;"></div>\n      </div>\n';
    c = c.replace(target2, newsSection2 + target2);
    fs.writeFileSync(file, c, 'utf8');
    console.log('Added news section (Unix). Size:', fs.statSync(file).size);
  } else {
    console.log('Could not find Commentary target');
  }
}

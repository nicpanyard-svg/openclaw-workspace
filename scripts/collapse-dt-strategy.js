const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Wrap the strategy grid + philosophy in a collapsible container, hidden by default
c = c.replace(
  '<div class="dt-strategy">',
  '<div class="dt-strategy">\n        <button onclick="var el=document.getElementById(\'dt-strategy-body\');el.style.display=el.style.display===\'none\'?\'block\':\'none\';this.textContent=this.textContent.includes(\'Rules\')? \'&#9660; Rules & Strategy\':\'&#9654; Rules & Strategy\'" style="background:none;border:1px solid #2a2a2d;color:#55555c;font-size:11px;padding:4px 12px;border-radius:6px;cursor:pointer;margin-bottom:10px;">&#9654; Rules & Strategy</button>\n        <div id="dt-strategy-body" style="display:none;">'
);

// Close the new wrapper before </div> of dt-strategy
c = c.replace(
  '</div>\n      </div>\n</div>\n\n<script>\n(function(){\n  var REFRESH_MS',
  '</div>\n        </div>\n      </div>\n</div>\n\n<script>\n(function(){\n  var REFRESH_MS'
);

fs.writeFileSync(file, c, 'utf8');
console.log('done');

const fs = require('fs');
const file = 'C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app\\public\\graham-board\\index.html';
let c = fs.readFileSync(file, 'utf8');

// Add CSS for TTS button
const css = `
  .dt-tts-btn { background: #1c1c1f; border: 1px solid #2a2a2d; color: #8b8b91; border-radius: 6px; padding: 5px 12px; cursor: pointer; font-size: 12px; transition: all 0.15s; display:flex;align-items:center;gap:6px; }
  .dt-tts-btn:hover { border-color: #5e6ad2; color: #e8e8ea; }
  .dt-tts-btn.speaking { background: #1b2042; border-color: #3a4080; color: #c5caff; }
`;
const lastStyle = c.lastIndexOf('</style>');
c = c.slice(0, lastStyle) + css + '\n</style>' + c.slice(lastStyle + 8);

// Add TTS button to report controls (after search input)
c = c.replace(
  '<span id="dt-search-count" style="font-size:11px;color:#55555c;white-space:nowrap;"></span>',
  '<span id="dt-search-count" style="font-size:11px;color:#55555c;white-space:nowrap;"></span>\n            <button class="dt-tts-btn" id="dt-tts-btn" onclick="dtToggleTTS()">&#128266; Read to me</button>'
);

// Add TTS JS
const js = `
var _dtSpeaking = false;
var _dtUtterance = null;

function dtToggleTTS() {
  var btn = document.getElementById('dt-tts-btn');
  if (_dtSpeaking) {
    window.speechSynthesis.cancel();
    _dtSpeaking = false;
    btn.textContent = '\\u{1F50A} Read to me';
    btn.classList.remove('speaking');
    return;
  }
  var el = document.getElementById('dt-phil-text');
  if (!el) return;
  var text = el.innerText || el.textContent || '';
  text = text.replace(/\\s+/g, ' ').trim();
  if (!text) return;

  _dtUtterance = new SpeechSynthesisUtterance(text);
  _dtUtterance.rate = 0.95;
  _dtUtterance.pitch = 1.0;
  _dtUtterance.volume = 1.0;

  // Pick a good voice if available
  var voices = window.speechSynthesis.getVoices();
  var preferred = voices.find(function(v) {
    return v.name.includes('Google US English') || v.name.includes('Alex') || v.name.includes('Samantha') || (v.lang === 'en-US' && v.default);
  });
  if (preferred) _dtUtterance.voice = preferred;

  _dtUtterance.onend = function() {
    _dtSpeaking = false;
    btn.innerHTML = '&#128266; Read to me';
    btn.classList.remove('speaking');
  };
  _dtUtterance.onerror = function() {
    _dtSpeaking = false;
    btn.innerHTML = '&#128266; Read to me';
    btn.classList.remove('speaking');
  };

  _dtSpeaking = true;
  btn.innerHTML = '&#128265; Stop';
  btn.classList.add('speaking');
  window.speechSynthesis.speak(_dtUtterance);
}
`;

var lastScript = c.lastIndexOf('</script>');
c = c.slice(0, lastScript) + js + '\n</script>' + c.slice(lastScript + 9);

fs.writeFileSync(file, c, 'utf8');
console.log('Done. Size:', fs.statSync(file).size);

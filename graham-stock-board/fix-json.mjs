import fs from 'fs';
const path = 'C:/Users/IkeFl/.openclaw/workspace/graham-stock-board/paper-trades.json';
let buf = fs.readFileSync(path);
// Strip UTF-8 BOM
if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) buf = buf.slice(3);

// File is UTF-8 but contains multi-byte sequences that are being mishandled.
// "â€"" in UTF-8 string = the bytes for em-dash were encoded as Windows-1252 into UTF-8
// This is a double-encoding issue: originally Windows-1252 bytes re-encoded as UTF-8
// Strategy: decode as latin1 first to get the raw bytes, then re-interpret

// The file appears to be latin1/cp1252-encoded content wrapped in UTF-8 BOM
// Let's try reading it as latin1
let str = buf.toString('latin1');

// Map Windows-1252 special chars that appear as multi-byte sequences in latin1 decode
// â€" = 0xE2 0x80 0x94 = em dash U+2014
str = str.replace(/\xE2\x80\x94/g, '-');
// â€™ = right single quote 
str = str.replace(/\xE2\x80\x99/g, "'");
// â€œ = left double quote
str = str.replace(/\xE2\x80\x9C/g, '"');
// â€ = right double quote  
str = str.replace(/\xE2\x80\x9D/g, '"');
// â†' = right arrow U+2192
str = str.replace(/\xE2\x86\x92/g, '->');
// ðŸš¨ = U+1F6A8 emergency light emoji (4-byte emoji, 0xF0 0x9F 0x9A 0xA8)
str = str.replace(/\xF0\x9F\x9A\xA8/g, '🚨');
// dŸs  pattern for other emoji
str = str.replace(/\xF0\x9F[\x80-\xFF][\x80-\xFF]/g, '');

// Now re-encode back to proper UTF-8
// str is latin1, but actually contains the correct code points for UTF-8 multi-byte chars
// We need to convert: treat each char as a byte value, rebuild as utf8 buffer
const bytes = Buffer.from(str, 'latin1');
const utf8str = bytes.toString('utf8');

try {
  const data = JSON.parse(utf8str);
  data.lastUpdated = '2026-03-30T20:50:00.000Z';
  data.note = 'AH CHECK 3:50PM CT 3/30/26 - 100% CASH $9,987.81. Market closed. AH prices not populating. Close: PLTR $137.55, IONQ $26.59, RKLB $57.38, TEM $42.37, SERV $7.73, RXRX $2.84. Zone check clean. No alerts. No trades. Q1 end tomorrow.';
  data.grahamNote = 'AH 3:50PM CT 3/30/26 - 100% cash, no positions. AH feed quiet. Key watch: IONQ $25 support, PLTR $135, RKLB $54-55. Re-entry triggers IONQ $30, PLTR $148, RKLB $60 all far above current. Q1 end tomorrow.';
  fs.writeFileSync(path, JSON.stringify(data, null, 4), 'utf8');
  console.log('OK - saved. Cash: ' + data.cash);
} catch(e) {
  console.log('PARSE ERROR: ' + e.message.substring(0,300));
  const m = e.message.match(/position (\d+)/);
  if (m) {
    const pos = parseInt(m[1]);
    console.log('Context: [' + utf8str.substring(Math.max(0,pos-80), pos+80) + ']');
  }
}

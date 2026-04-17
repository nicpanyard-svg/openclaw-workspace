const { sendEmail } = require('./ms-graph-email.js');

const body = `
<h2 style="font-family:Calibri,sans-serif; color:#003A70;">Ike Daily Wrap — Tuesday, March 31</h2>
<p style="font-family:Calibri,sans-serif;">Here's what we knocked out today:</p>

<h3 style="font-family:Calibri,sans-serif; color:#003A70;">⚙️ System &amp; Model Config</h3>
<ul style="font-family:Calibri,sans-serif;">
  <li>Removed OpenAI/GPT-4o — moving away from ChatGPT</li>
  <li>Fixed Ollama fallback: swapped llama3.2:latest (16GB, too large) for llama3.2:1b (1.3GB, fits in RAM)</li>
  <li>All background cron jobs (Graham trading, Mike daily report, domain warmup) switched to Claude Haiku to cut costs</li>
  <li>Sonnet stays as primary for main session</li>
</ul>

<h3 style="font-family:Calibri,sans-serif; color:#003A70;">📧 Mike Outreach System</h3>
<ul style="font-family:Calibri,sans-serif;">
  <li>Fixed critical bug: ms-graph.json config path was pointing to C:\\ROOT — now fixed via env var</li>
  <li>Wired in your official Outlook signature with iNet logo (CID inline — shows automatically)</li>
  <li>Emails now <strong>auto-send</strong> — no approval step needed</li>
  <li>Added <strong>Sent &amp; Follow-up</strong> tab in Mission Control outreach page</li>
  <li>Sent items auto-hide from queue view</li>
  <li>3 emails went out today: Bacon &amp; Wagner (Enterprise Products), Brien Brown (ONEOK)</li>
</ul>

<h3 style="font-family:Calibri,sans-serif; color:#003A70;">📋 Tomorrow's Follow-ups</h3>
<ul style="font-family:Calibri,sans-serif;">
  <li>Mike kicks off at 9 AM — emails fire automatically</li>
  <li>Fix Graham 5-min trading cron (10 consecutive timeouts)</li>
  <li>Fix /api/mike/inbox 502 error</li>
  <li>Top up OpenAI credits or switch embedding provider to restore memory search</li>
</ul>

<p style="font-family:Calibri,sans-serif;">Good night —<br><strong>Ike</strong></p>
`;

sendEmail('nick.panyard@inetlte.com', 'Ike Daily Wrap — Tuesday March 31', body)
  .then(() => console.log('Sent!'))
  .catch(e => console.error('Failed:', e.message));

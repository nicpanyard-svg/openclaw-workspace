const { ConfidentialClientApplication } = require('@azure/msal-node');
const { readFileSync } = require('fs');

const config = JSON.parse(readFileSync('C:\\Users\\IkeFl\\.openclaw\\workspace\\config\\ms-graph.json', 'utf-8'));
const logoB64 = readFileSync('C:\\Users\\IkeFl\\.openclaw\\workspace\\config\\inet-logo.b64', 'utf-8').trim();

const app = new ConfidentialClientApplication({
  auth: { clientId: config.clientId, clientSecret: config.clientSecret, authority: `https://login.microsoftonline.com/${config.tenantId}` }
});

const sig = `<table cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="border-right:1px solid #a6a6a6; padding-right:10px; vertical-align:top;">
    <img src="cid:inetlogo" width="212" height="124" alt="iNet Logo">
  </td>
  <td style="padding-left:14px; vertical-align:top; font-family:'Century Gothic',sans-serif; font-size:9pt;">
    <p style="margin:0"><span style="font-family:Calibri,sans-serif; font-size:11pt;"><b>Nick Panyard</b></span></p>
    <p style="margin:0; color:rgb(31,56,100)"><i>Sales Executive</i></p>
    <p style="margin:0; color:rgb(31,56,100)"><i>Renewable Energy and New Market Solutions</i></p>
    <p style="margin:0; color:rgb(89,89,89)">Galleria Tower 2</p>
    <p style="margin:0; color:rgb(89,89,89)">5051 Westheimer Road, Suite 1700</p>
    <p style="margin:0; color:rgb(89,89,89)">Houston, TX 77056</p>
    <p style="margin:0; color:rgb(89,89,89)">Mobile: +1.919.864.5912</p>
    <p style="margin:0;"><a href="mailto:Nick.Panyard@inetlte.com" style="color:rgb(70,120,134)">Nick.Panyard@inetlte.com</a></p>
    <p style="margin:0;"><a href="http://www.inetlte.com" style="color:rgb(5,99,193)">www.inetLTE.com</a></p>
  </td>
</tr></table>`;

app.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] }).then(r => {
  const msg = {
    subject: 'Signature Test #4 — CID Inline Logo',
    body: { contentType: 'HTML', content: `<p>Nick,</p><p>Testing CID inline logo attachment — should show automatically.</p><br><br>${sig}` },
    toRecipients: [{ emailAddress: { address: 'nick.panyard@inetlte.com' } }],
    from: { emailAddress: { address: config.userEmail, name: 'Nick Panyard' } },
    attachments: [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'logo.jpg',
      contentType: 'image/jpeg',
      contentBytes: logoB64,
      contentId: 'inetlogo',
      isInline: true
    }]
  };
  return fetch(`https://graph.microsoft.com/v1.0/users/${config.userEmail}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${r.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, saveToSentItems: true })
  });
}).then(r => {
  console.log('Status:', r.status);
  return r.text();
}).then(t => { if (t) console.log(t); })
.catch(e => console.error('Error:', e.message));

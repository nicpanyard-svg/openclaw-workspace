// Microsoft Graph Email Service
// Uses MSAL client credentials flow to send/read email via Graph API
// Config loaded from: config/ms-graph.json

const { ConfidentialClientApplication } = require('@azure/msal-node');
const { readFileSync } = require('fs');
const { join } = require('path');

const CONFIG_PATH = process.env.MS_GRAPH_CONFIG || join(__dirname, '../../config/ms-graph.json');
const LOGO_PATH = process.env.MS_GRAPH_CONFIG
  ? join(process.env.MS_GRAPH_CONFIG, '..', 'inet-logo.b64')
  : join(__dirname, '../../../../config/inet-logo.b64');

let _config = null;
function getConfig() {
  if (!_config) {
    _config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return _config;
}

let _logoB64 = null;
function getLogo() {
  if (!_logoB64) {
    try {
      _logoB64 = readFileSync('C:\\Users\\IkeFl\\.openclaw\\workspace\\config\\inet-logo.b64', 'utf-8').trim();
    } catch (e) {
      _logoB64 = '';
    }
  }
  return _logoB64;
}

let _msalApp = null;
function getMsalApp() {
  if (!_msalApp) {
    const { tenantId, clientId, clientSecret } = getConfig();
    _msalApp = new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    });
  }
  return _msalApp;
}

// Simple in-memory token cache
let _tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 30_000) {
    return _tokenCache.token;
  }
  const result = await getMsalApp().acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  _tokenCache.token = result.accessToken;
  _tokenCache.expiresAt = result.expiresOn.getTime();
  return _tokenCache.token;
}

async function graphRequest(method, path, body) {
  const token = await getAccessToken();
  const { userEmail } = getConfig();
  const url = `https://graph.microsoft.com/v1.0/users/${userEmail}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 202 || res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Graph API ${method} ${path} failed (${res.status}): ${data?.error?.message ?? 'Unknown error'}`
    );
  }
  return data;
}

// Official Outlook signature — CID inline logo
const NICK_SIGNATURE = `<table cellpadding="0" cellspacing="0" border="0"><tr>
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
    <p style="margin:0;"><a href="http://www.inetlte.com" style="color:rgb(5,99,193)">www.inetLTE.com</a> &nbsp;
      <a href="https://www.facebook.com/InfrastructureNetworks/" style="color:rgb(5,99,193)">Facebook</a> |
      <a href="https://twitter.com/INETInnovation" style="color:rgb(5,99,193)">Twitter</a> |
      <a href="https://www.linkedin.com/company/3671336/" style="color:rgb(5,99,193)">LinkedIn</a>
    </p>
  </td>
</tr></table>`;

/**
 * Send an email from the configured user.
 * Automatically appends Nick's official Outlook signature with inline CID logo.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} body - HTML email body (signature will be appended)
 */
async function sendEmail(to, subject, body) {
  const { userEmail, ccEmail } = getConfig();
  const logoB64 = getLogo();

  const fullBody = `${body}<br><br>${NICK_SIGNATURE}`;

  const message = {
    subject,
    body: { contentType: 'HTML', content: fullBody },
    toRecipients: [{ emailAddress: { address: to } }],
    from: { emailAddress: { address: userEmail, name: 'Nick Panyard' } },
    replyTo: [{ emailAddress: { address: userEmail, name: 'Nick Panyard' } }],
  };

  if (ccEmail && ccEmail !== to) {
    message.ccRecipients = [{ emailAddress: { address: ccEmail } }];
  }

  if (logoB64) {
    message.attachments = [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: 'logo.jpg',
      contentType: 'image/png',
      contentBytes: logoB64,
      contentId: 'inetlogo',
      isInline: true
    }];
  }

  const token = await getAccessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${userEmail}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, saveToSentItems: true })
  });

  if (res.status !== 202 && res.status !== 204) {
    const data = await res.json();
    throw new Error(`Send failed (${res.status}): ${data?.error?.message ?? 'Unknown'}`);
  }
}

/**
 * Read emails from inbox.
 * @param {string} [filter] - OData filter string (default: unread messages)
 * @returns {Promise<Array<{id, from, fromName, subject, body, receivedAt, isRead}>>}
 */
async function readInbox(filter) {
  const params = new URLSearchParams({
    $filter: filter ?? 'isRead eq false',
    $select: 'id,from,subject,body,receivedDateTime,isRead',
    $top: '50',
    $orderby: 'receivedDateTime desc',
  });
  const data = await graphRequest('GET', `/messages?${params}`);
  return (data?.value ?? []).map((m) => ({
    id: m.id,
    from: m.from?.emailAddress?.address ?? '',
    fromName: m.from?.emailAddress?.name ?? '',
    subject: m.subject ?? '(no subject)',
    body: m.body?.content ?? '',
    receivedAt: m.receivedDateTime,
    isRead: m.isRead ?? false,
  }));
}

/**
 * Mark a message as read.
 * @param {string} messageId
 */
async function markRead(messageId) {
  await graphRequest('PATCH', `/messages/${messageId}`, { isRead: true });
}

/**
 * Reply to an email thread.
 * @param {string} messageId - ID of the message to reply to
 * @param {string} body - Plain text reply content
 */
async function replyToEmail(messageId, body) {
  await graphRequest('POST', `/messages/${messageId}/reply`, {
    comment: body,
  });
}

module.exports = { sendEmail, readInbox, markRead, replyToEmail };

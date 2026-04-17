/**
 * Mike Auth — Device Code Flow
 * Run this once to authenticate Nick's Microsoft account.
 * Token saved to config/ms-graph-token.json for Mike to reuse.
 */

const { PublicClientApplication } = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/ms-graph.json');
const TOKEN_PATH = path.join(__dirname, '../config/ms-graph-token.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const msalApp = new PublicClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
  }
});

const scopes = ['Mail.Read', 'Mail.Send', 'Mail.ReadWrite', 'offline_access'];

async function authenticate() {
  console.log('\n🔐 Mike Auth — One-time Microsoft login\n');

  const response = await msalApp.acquireTokenByDeviceCode({
    scopes,
    deviceCodeCallback: (info) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 Step 1: Open this URL in your browser:');
      console.log(`   ${info.verificationUri}`);
      console.log('');
      console.log('🔑 Step 2: Enter this code:');
      console.log(`   ${info.userCode}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Waiting for you to sign in...\n');
    }
  });

  // Save token
  const tokenData = {
    accessToken: response.accessToken,
    account: response.account,
    expiresOn: response.expiresOn,
    refreshToken: response.refreshToken || null,
    scopes: response.scopes,
    savedAt: new Date().toISOString()
  };

  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
  console.log('✅ Auth complete! Token saved.');
  console.log(`   Account: ${response.account.username}`);
  console.log('   Mike is ready to send emails.\n');
}

authenticate().catch(e => {
  console.error('❌ Auth failed:', e.message);
  process.exit(1);
});

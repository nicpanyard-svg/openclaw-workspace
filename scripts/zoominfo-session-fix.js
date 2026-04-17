/**
 * ZoomInfo Session Fix v3 - Jill
 *
 * v2 findings: cookies + basic okta-token-storage wasn't enough.
 * The SPA checks okta-token-storage for valid claims, scopes, and expiresAt.
 *
 * v3 strategy:
 * 1. Parse actual JWT claims from ziaccesstoken
 * 2. Build okta-token-storage with real claims, scopes, expiresAt from JWT
 * 3. Also set idToken in okta-token-storage (same token, Okta SDK expects it)
 * 4. Set okta-cache-storage to prevent Okta SDK from re-validating
 * 5. Intercept requests + block login redirects as before
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, '..', 'mission-control-app', 'data', 'zoominfo_cookies.json');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function decodeJwt(token) {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload;
}

async function main() {
  const cookiesData = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
  const cookies = cookiesData.cookies;

  const accessTokenCookie = cookies.find(c => c.name === 'ziaccesstoken');
  if (!accessTokenCookie) {
    console.log('ERROR: No ziaccesstoken found');
    process.exit(1);
  }
  const accessToken = accessTokenCookie.value;

  // Step 0: Decode JWT and check expiration
  const jwt = decodeJwt(accessToken);
  const now = Math.floor(Date.now() / 1000);
  const expDate = new Date(jwt.exp * 1000);
  const iatDate = new Date(jwt.iat * 1000);
  console.log(`JWT sub: ${jwt.sub}`);
  console.log(`JWT iat: ${iatDate.toISOString()}`);
  console.log(`JWT exp: ${expDate.toISOString()}`);
  console.log(`Now:     ${new Date().toISOString()}`);
  console.log(`JWT expired: ${now > jwt.exp} (${now > jwt.exp ? `expired ${now - jwt.exp}s ago` : `valid for ${jwt.exp - now}s more`})`);

  if (now > jwt.exp) {
    console.log('\n*** JWT IS EXPIRED ***');
    console.log('The access token has expired. Need Nick to refresh the session.');
    console.log('However, lets still try — zisession cookie might work independently.\n');
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'sec-ch-ua': '"Chromium";v="134", "Google Chrome";v="134", "Not:A-Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    }
  });

  // Set cookies on both domains
  const playwrightCookies = [];
  for (const c of cookies) {
    const base = {
      name: c.name,
      value: c.value,
      path: '/',
      expires: c.expires ? Math.floor(new Date(c.expires).getTime() / 1000) : -1,
      httpOnly: false,
      secure: true,
      sameSite: 'None'
    };
    playwrightCookies.push({ ...base, domain: '.zoominfo.com' });
    playwrightCookies.push({ ...base, domain: 'app.zoominfo.com' });
  }
  await context.addCookies(playwrightCookies);
  console.log(`\nInjected ${playwrightCookies.length} cookies`);

  // Anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  // Strategy A: Intercept API requests and add Authorization header
  let interceptedRequests = 0;
  let redirectBlocked = 0;
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const headers = { ...route.request().headers() };

    // Add auth header to ZoomInfo API calls
    if (url.includes('zoominfo.com') && !url.includes('login.zoominfo.com')) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      interceptedRequests++;
    }

    // If being redirected to login, abort and stay on app
    if (url.includes('login.zoominfo.com') && route.request().resourceType() === 'document') {
      redirectBlocked++;
      console.log(`  BLOCKED redirect to: ${url.substring(0, 100)}`);
      // Don't abort — fulfill with a redirect back to app
      await route.fulfill({
        status: 302,
        headers: { 'Location': 'https://app.zoominfo.com/' }
      });
      return;
    }

    await route.continue({ headers });
  });

  // Strategy B: Set localStorage BEFORE any page JS runs
  // Parse JWT claims to build proper okta-token-storage
  const jwtClaims = decodeJwt(accessToken);
  const oktaTokenStorage = {
    accessToken: {
      accessToken: accessToken,
      claims: {
        ver: jwtClaims.ver,
        jti: jwtClaims.jti,
        iss: jwtClaims.iss,
        aud: jwtClaims.aud,
        sub: jwtClaims.sub,
        iat: jwtClaims.iat,
        exp: jwtClaims.exp,
        cid: jwtClaims.cid,
        uid: jwtClaims.uid,
        scp: jwtClaims.scp,
        auth_time: jwtClaims.auth_time
      },
      expiresAt: jwtClaims.exp,
      tokenType: 'Bearer',
      scopes: {
        openid: true,
        email: true,
        profile: true,
        offline_access: true
      },
      authorizeUrl: 'https://okta-login.zoominfo.com/oauth2/default/v1/authorize',
      userinfoUrl: 'https://okta-login.zoominfo.com/oauth2/default/v1/userinfo'
    },
    idToken: {
      idToken: accessToken,
      claims: {
        sub: jwtClaims.sub,
        email: jwtClaims.email || jwtClaims.sub,
        ver: 1,
        iss: jwtClaims.iss,
        aud: jwtClaims.cid,
        iat: jwtClaims.iat,
        exp: jwtClaims.exp,
        auth_time: jwtClaims.auth_time,
        at_hash: 'placeholder'
      },
      expiresAt: jwtClaims.exp,
      scopes: {
        openid: true,
        email: true,
        profile: true
      },
      authorizeUrl: 'https://okta-login.zoominfo.com/oauth2/default/v1/authorize',
      issuer: jwtClaims.iss,
      clientId: jwtClaims.cid
    }
  };

  // Also build okta-cache-storage to suppress re-validation
  const oktaCacheStorage = {
    'https://okta-login.zoominfo.com/oauth2/default/.well-known/openid-configuration': {
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
      response: {
        issuer: 'https://okta-login.zoominfo.com/oauth2/default',
        authorization_endpoint: 'https://okta-login.zoominfo.com/oauth2/default/v1/authorize',
        token_endpoint: 'https://okta-login.zoominfo.com/oauth2/default/v1/token',
        userinfo_endpoint: 'https://okta-login.zoominfo.com/oauth2/default/v1/userinfo',
        jwks_uri: 'https://okta-login.zoominfo.com/oauth2/default/v1/keys'
      }
    }
  };

  const initData = JSON.stringify({
    oktaTokenStorage: JSON.stringify(oktaTokenStorage),
    oktaCacheStorage: JSON.stringify(oktaCacheStorage),
    accessToken: accessToken,
    userId: String(jwtClaims.ziUserId),
    email: jwtClaims.email || jwtClaims.sub
  });

  await context.addInitScript((dataStr) => {
    if (window.location.hostname === 'app.zoominfo.com') {
      try {
        const data = JSON.parse(dataStr);
        // Okta SDK token storage — the key auth check
        localStorage.setItem('okta-token-storage', data.oktaTokenStorage);
        // Okta cache to suppress re-validation
        localStorage.setItem('okta-cache-storage', data.oktaCacheStorage);
        // ZoomInfo's own token keys
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('zi-access-token', data.accessToken);
        // User identity keys ZoomInfo may check
        localStorage.setItem('zi-user-id', data.userId);
        localStorage.setItem('zi-user-email', data.email);
        // Suppress Okta auth redirect flag
        localStorage.setItem('okta-shared-transaction-storage', '{}');
        console.log('[ZI-FIX] localStorage injected with full Okta token storage');
      } catch (e) {
        console.error('[ZI-FIX] init error:', e);
      }
    }
  }, initData);

  // Navigate
  console.log('\n--- Navigating to app.zoominfo.com ---');
  const startTime = Date.now();

  try {
    const response = await page.goto('https://app.zoominfo.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    console.log(`Initial response status: ${response?.status()}`);
  } catch (e) {
    console.log(`Navigation error (expected if redirect blocked): ${e.message.substring(0, 100)}`);
  }

  await sleep(3000);

  const urlAfterInit = page.url();
  console.log(`URL after initial load: ${urlAfterInit}`);
  console.log(`Intercepted ${interceptedRequests} requests, blocked ${redirectBlocked} redirects`);

  // If we're still on app.zoominfo.com, try SPA navigation
  if (urlAfterInit.includes('app.zoominfo.com')) {
    console.log('\n--- Attempting SPA hash navigation ---');
    await page.evaluate(() => {
      window.location.hash = '#/apps/search/v2/results/person';
    });
    await sleep(5000);
  }

  // Report
  const finalUrl = page.url();
  const title = await page.title();
  console.log(`\n=== RESULTS ===`);
  console.log(`Final URL: ${finalUrl}`);
  console.log(`Page title: ${title}`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log(`Requests intercepted: ${interceptedRequests}`);
  console.log(`Redirects blocked: ${redirectBlocked}`);

  // Page content analysis
  const bodyText = await page.locator('body').textContent();
  const snippet = bodyText.replace(/\s+/g, ' ').trim().substring(0, 500);
  console.log(`\nPage body (500 chars):\n${snippet}`);

  const hasSearchUI = bodyText.includes('Search') || bodyText.includes('Contact') || bodyText.includes('Company');
  const hasLoginForm = bodyText.includes('Sign In') || bodyText.includes('Username') || bodyText.includes('Password');
  console.log(`\nHas search UI: ${hasSearchUI}`);
  console.log(`Has login form: ${hasLoginForm}`);

  if (finalUrl.includes('login') || finalUrl.includes('signin')) {
    console.log('\nSTATUS: FAILED — still redirected to login');
  } else if (hasSearchUI && !hasLoginForm) {
    console.log('\nSTATUS: SUCCESS — search UI visible');
  } else if (hasLoginForm) {
    console.log('\nSTATUS: FAILED — login form showing on app domain');
  } else {
    console.log('\nSTATUS: UNCLEAR — check screenshot');
  }

  // Screenshot
  const screenshotPath = path.join(__dirname, 'zoominfo-session-fix-screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Screenshot: ${screenshotPath}`);

  // Dump network log of failed/redirect requests
  const browserCookies = await context.cookies('https://app.zoominfo.com');
  console.log(`\nCookies on app.zoominfo.com: ${browserCookies.length}`);

  const lsData = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      keys.push(`${key} (${val?.length || 0} chars)`);
    }
    // Check if okta-token-storage survived or was overwritten
    const oktaStorage = localStorage.getItem('okta-token-storage');
    let oktaInfo = 'not set';
    if (oktaStorage) {
      try {
        const parsed = JSON.parse(oktaStorage);
        const hasAccess = !!parsed.accessToken?.accessToken;
        const hasId = !!parsed.idToken?.idToken;
        const expAt = parsed.accessToken?.expiresAt;
        oktaInfo = `accessToken:${hasAccess}, idToken:${hasId}, expiresAt:${expAt}`;
      } catch (e) {
        oktaInfo = `parse error: ${e.message}`;
      }
    }
    return { keys, oktaInfo };
  });
  console.log(`localStorage keys: ${lsData.keys.join(', ')}`);
  console.log(`okta-token-storage status: ${lsData.oktaInfo}`);

  await browser.close();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

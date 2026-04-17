// mike-linkedin-test.js
// Mike's first LinkedIn browser test — verifies Playwright can open LinkedIn,
// reach the login page, and interact with the UI.
// Does NOT log in — just proves the connection works.

const { chromium } = require('playwright');

(async () => {
  console.log('[Mike] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  console.log('[Mike] Navigating to LinkedIn...');
  await page.goto('https://www.linkedin.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  const title = await page.title();
  console.log(`[Mike] Page title: "${title}"`);

  // Check for sign-in form
  const signInBtn = await page.$('a[data-tracking-control-name="guest_homepage-basic_nav-header-signin"]');
  const emailInput = await page.$('#session_key');

  if (emailInput) {
    console.log('[Mike] ✅ Login form detected — LinkedIn is reachable and interactive');
  } else if (signInBtn) {
    console.log('[Mike] ✅ Sign-in button found — LinkedIn homepage loaded');
  } else {
    // Check if we landed on a different page (redirect, CAPTCHA, etc.)
    const url = page.url();
    console.log(`[Mike] Current URL: ${url}`);
    const bodyText = await page.innerText('body').catch(() => '');
    if (bodyText.includes('LinkedIn') || bodyText.includes('Sign in')) {
      console.log('[Mike] ✅ LinkedIn content detected on page');
    } else {
      console.log('[Mike] ⚠️  Unexpected page — may need login credentials or anti-bot handling');
    }
  }

  // Take a screenshot for review
  await page.screenshot({ path: 'linkedin-test-screenshot.png', fullPage: false });
  console.log('[Mike] Screenshot saved: linkedin-test-screenshot.png');

  await browser.close();
  console.log('[Mike] Done — browser closed');
})();

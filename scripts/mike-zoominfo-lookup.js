/**
 * Mike - ZoomInfo Lookup Script
 * Searches ZoomInfo for each LOOKUP_NEEDED prospect by company + target title.
 * Extracts: full name, title, direct email, LinkedIn URL.
 * Saves results to scripts/zoominfo-results.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'mission-control-app', 'data');
const PROSPECTS_FILE = path.join(DATA_DIR, 'prospects_2026-03-21.json');
const COOKIES_FILE = path.join(DATA_DIR, 'zoominfo_cookies.json');
const RESULTS_FILE = path.join(__dirname, 'zoominfo-results.json');

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const prospectsData = JSON.parse(fs.readFileSync(PROSPECTS_FILE, 'utf8'));
  const cookiesData = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));

  const lookupNeeded = prospectsData.prospects.filter(p => p.name === 'LOOKUP_NEEDED');
  console.log(`Found ${lookupNeeded.length} prospects needing ZoomInfo lookup`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
  });

  // Inject ZoomInfo cookies
  const playwrightCookies = cookiesData.cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: '/',
    expires: c.expires ? Math.floor(new Date(c.expires).getTime() / 1000) : -1,
    httpOnly: false,
    secure: true,
    sameSite: 'None'
  }));
  await context.addCookies(playwrightCookies);

  const page = await context.newPage();
  const results = [];

  // Navigate to ZoomInfo to verify session
  console.log('Navigating to ZoomInfo...');
  await page.goto('https://app.zoominfo.com/#/apps/search/v2/results/person', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await sleep(3000);

  // Check if we're logged in
  const currentUrl = page.url();
  console.log(`Current URL: ${currentUrl}`);
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    console.log('ERROR: Not logged in to ZoomInfo. Cookies may be expired.');
    await browser.close();
    process.exit(1);
  }
  console.log('ZoomInfo session active.\n');

  for (const prospect of lookupNeeded) {
    console.log(`--- Looking up: ${prospect.company} ---`);
    console.log(`  Target title: ${prospect.targetTitle}`);

    const result = {
      id: prospect.id,
      company: prospect.company,
      targetTitle: prospect.targetTitle,
      found: false,
      name: null,
      title: null,
      email: null,
      linkedinUrl: null,
      error: null
    };

    try {
      // Navigate to person search
      await page.goto('https://app.zoominfo.com/#/apps/search/v2/results/person', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await sleep(2000);

      // Clear any existing filters and search by company
      // Use the ZoomInfo search/filter UI
      // First try the company name filter
      const companySearchSelector = '[data-automation="company-name-filter-input"], input[placeholder*="Company"], input[placeholder*="company"]';
      const titleSearchSelector = '[data-automation="job-title-filter-input"], input[placeholder*="Job Title"], input[placeholder*="title"]';

      // Try using the URL-based search approach (more reliable)
      const companyName = encodeURIComponent(prospect.company.split('(')[0].trim());
      // Extract first target title keyword
      const titleKeywords = prospect.targetTitle.split('/')[0].trim();
      const encodedTitle = encodeURIComponent(titleKeywords);

      const searchUrl = `https://app.zoominfo.com/#/apps/search/v2/results/person?query=${companyName}%20${encodedTitle}`;
      console.log(`  Searching: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(4000);

      // Try to find results in the search results table
      // Look for contact cards/rows
      const contactSelectors = [
        '.results-table-row',
        '[data-automation="search-result-row"]',
        '.contact-card',
        '.search-result-item',
        'table tbody tr',
        '.results-list-item'
      ];

      let foundContacts = false;
      for (const selector of contactSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          foundContacts = true;
          console.log(`  Found ${count} results using selector: ${selector}`);

          // Get the first result
          const firstRow = page.locator(selector).first();
          const rowText = await firstRow.textContent();
          console.log(`  First result text: ${rowText.substring(0, 200)}`);

          // Try to extract name from the first result
          const nameSelectors = [
            '.contact-name', '.person-name', 'a[data-automation="contact-name"]',
            '.name-link', 'td:first-child a', '.result-name'
          ];
          for (const ns of nameSelectors) {
            const nameEl = firstRow.locator(ns).first();
            if (await nameEl.count() > 0) {
              result.name = (await nameEl.textContent()).trim();
              break;
            }
          }

          // Try to extract title
          const titleSelectors = [
            '.job-title', '.contact-title', '[data-automation="contact-title"]',
            '.title-text', 'td:nth-child(2)'
          ];
          for (const ts of titleSelectors) {
            const titleEl = firstRow.locator(ts).first();
            if (await titleEl.count() > 0) {
              result.title = (await titleEl.textContent()).trim();
              break;
            }
          }

          // Try to get email
          const emailSelectors = [
            '.email-link', '.contact-email', '[data-automation="contact-email"]',
            'a[href^="mailto:"]'
          ];
          for (const es of emailSelectors) {
            const emailEl = firstRow.locator(es).first();
            if (await emailEl.count() > 0) {
              result.email = (await emailEl.textContent()).trim();
              break;
            }
          }

          break;
        }
      }

      if (!foundContacts) {
        console.log('  No results found with standard selectors. Taking screenshot...');
        const screenshotPath = path.join(__dirname, `zoominfo-${prospect.id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`  Screenshot saved: ${screenshotPath}`);

        // Try to extract any visible text that might be contact info
        const bodyText = await page.locator('body').textContent();
        result.pageSnippet = bodyText.substring(0, 500);
      }

      // Click into first result to get more detail if we found contacts
      if (foundContacts && result.name) {
        result.found = true;
        console.log(`  FOUND: ${result.name} - ${result.title}`);

        // Try clicking to get LinkedIn URL from profile
        try {
          const nameLink = page.locator('a').filter({ hasText: result.name }).first();
          if (await nameLink.count() > 0) {
            await nameLink.click();
            await sleep(3000);

            // Look for LinkedIn URL on profile page
            const linkedinLink = page.locator('a[href*="linkedin.com"]').first();
            if (await linkedinLink.count() > 0) {
              result.linkedinUrl = await linkedinLink.getAttribute('href');
              console.log(`  LinkedIn: ${result.linkedinUrl}`);
            }

            // Look for email on profile page
            if (!result.email) {
              const emailOnProfile = page.locator('a[href^="mailto:"]').first();
              if (await emailOnProfile.count() > 0) {
                result.email = (await emailOnProfile.textContent()).trim();
                console.log(`  Email: ${result.email}`);
              }
            }
          }
        } catch (e) {
          console.log(`  Could not get profile details: ${e.message}`);
        }
      } else {
        console.log('  No matching contact found.');
      }

    } catch (err) {
      result.error = err.message;
      console.log(`  ERROR: ${err.message}`);
    }

    results.push(result);
    console.log('');

    // Rate limit - don't hammer ZoomInfo
    await sleep(2000);
  }

  // Save results
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'ZoomInfo',
    totalSearched: lookupNeeded.length,
    totalFound: results.filter(r => r.found).length,
    results
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to ${RESULTS_FILE}`);
  console.log(`Found: ${output.totalFound}/${output.totalSearched}`);

  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

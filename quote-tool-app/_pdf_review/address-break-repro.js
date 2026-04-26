const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = 'http://127.0.0.1:3000';
const outDir = process.argv[2] || path.join(process.cwd(), '_pdf_review');
const tag = process.argv[3] || 'run';
const mode = process.argv[4] || 'fixed';
const customerExtraCount = Number(process.argv[5] || 0);
const billExtraCount = Number(process.argv[6] || 0);

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: puppeteer.defaultArgs({ headless: true }),
    defaultViewport: { width: 1400, height: 1800, deviceScaleFactor: 1 },
  });

  try {
    const page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      const authSession = {
        user: {
          id: 'nick-panyard',
          name: 'Nick Panyard',
          email: 'nick.panyard@inetlte.com',
          title: 'Account Executive',
          team: 'Sales',
          role: 'sales',
          status: 'active',
          initials: 'NP',
          canManageUsers: false,
        },
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      };
      window.localStorage.setItem('rapidquote:auth-session', JSON.stringify(authSession));
    });

    await page.goto(`${baseUrl}/proposal`, { waitUntil: 'networkidle0' });

    await page.evaluate(({ customerExtraCount, billExtraCount }) => {
      const key = 'quote-tool-app:proposal-state';
      const raw = window.sessionStorage.getItem(key);
      if (!raw) throw new Error('No proposal state found in sessionStorage');
      const quote = JSON.parse(raw);

      const tallCustomerLines = [
        'Accounts Payable Department',
        'Long Address Customer',
        'PO Box 171073',
        'Building 4, Suite 1800',
        'Mail Stop 22A',
        'Industrial Campus North',
        ...Array.from({ length: customerExtraCount }, (_, index) => `Customer extra line ${index + 1}`),
        'Kansas City, Kansas 66117',
        'United States',
      ];
      const tallInetLines = [
        'Galleria Tower 2',
        'Attn: Enterprise Sales',
        '5051 Westheimer Road, Suite 1700',
        'Floor 17',
        'West Lobby Reception',
        ...Array.from({ length: customerExtraCount }, (_, index) => `iNet extra line ${index + 1}`),
        'Houston, TX 77056',
        'United States',
      ];
      const tallBillLines = [
        'Morgan Example',
        'PO Box 171073',
        'Building 4, Suite 1800',
        'Mail Stop 22A',
        'Industrial Campus North',
        ...Array.from({ length: billExtraCount }, (_, index) => `Bill extra line ${index + 1}`),
        'Kansas City, Kansas 66117',
        'United States',
      ];

      quote.customer.name = 'Boundary Test Customer';
      quote.customer.logoText = 'Boundary Test Customer';
      quote.customer.contactName = 'Morgan Example';
      quote.customer.addressLines = tallCustomerLines;
      quote.inet.addressLines = tallInetLines;
      quote.billTo.companyName = 'Boundary Test Customer';
      quote.billTo.attention = 'Morgan Example';
      quote.billTo.lines = tallBillLines;
      quote.shipTo.companyName = 'Boundary Test Customer';
      quote.shipTo.attention = 'Morgan Example';
      quote.shipTo.lines = tallBillLines;
      quote.shippingSameAsBillTo = true;

      window.sessionStorage.setItem(key, JSON.stringify(quote));
    }, { customerExtraCount, billExtraCount });

    await page.goto(`${baseUrl}/proposal/print?autoprint=0`, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    await page.evaluateHandle('document.fonts.ready');

    await page.addStyleTag({
      content: mode === 'original'
        ? `
          .proposal-info-page .proposal-address-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: auto !important;
            margin-top: 10px !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            border-collapse: separate !important;
            border-spacing: 0 !important;
          }
          .proposal-info-page .proposal-address-grid > .proposal-copy-card {
            display: block !important;
            width: auto !important;
          }
        `
        : `
          .proposal-info-page .proposal-address-grid {
            display: table !important;
            table-layout: fixed !important;
            width: calc(100% + 10px) !important;
            margin-top: 10px !important;
            margin-left: -5px !important;
            margin-right: -5px !important;
            border-collapse: separate !important;
            border-spacing: 10px 0 !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .proposal-info-page .proposal-address-grid > .proposal-copy-card {
            display: table-cell !important;
            width: 50% !important;
            vertical-align: top !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        `,
    });

    const metrics = await page.evaluate(() => {
      const pageEl = document.querySelector('.proposal-info-page');
      const grid = document.querySelector('.proposal-info-page .proposal-address-grid');
      const bill = document.querySelector('.proposal-info-page .proposal-address-grid > .proposal-copy-card:first-child');
      const ship = document.querySelector('.proposal-info-page .proposal-address-grid > .proposal-copy-card:last-child');
      if (!pageEl || !grid || !bill || !ship) throw new Error('Proposal info page elements not found');

      const pageRect = pageEl.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      const billRect = bill.getBoundingClientRect();
      const shipRect = ship.getBoundingClientRect();
      return {
        pageHeight: pageRect.height,
        gridTop: gridRect.top - pageRect.top,
        gridBottom: gridRect.bottom - pageRect.top,
        billTop: billRect.top - pageRect.top,
        billBottom: billRect.bottom - pageRect.top,
        shipTop: shipRect.top - pageRect.top,
        shipBottom: shipRect.bottom - pageRect.top,
        billText: (bill.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    });

    const pdfPath = path.join(outDir, `${tag}.pdf`);
    const pngPath = path.join(outDir, `${tag}.png`);
    const jsonPath = path.join(outDir, `${tag}-metrics.json`);

    await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, preferCSSPageSize: true });
    await page.screenshot({ path: pngPath, fullPage: true });
    fs.writeFileSync(jsonPath, JSON.stringify(metrics, null, 2));

    console.log(JSON.stringify({ pdfPath, pngPath, jsonPath, metrics }, null, 2));
    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

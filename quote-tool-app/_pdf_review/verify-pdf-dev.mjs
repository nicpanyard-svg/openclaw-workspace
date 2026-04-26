import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
const base = 'http://localhost:3000';
const consoleMessages = [];
const pageErrors = [];
page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', err => pageErrors.push(String(err)));

async function clickByText(selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const v = await page.evaluate(el => (el.innerText || el.textContent || '').trim(), el);
    if (v.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

async function setField(labelText, value) {
  const ok = await page.evaluate((labelText, value) => {
    const labels = [...document.querySelectorAll('label')];
    for (const label of labels) {
      const span = label.querySelector('span');
      const txt = (span?.textContent || label.textContent || '').trim();
      if (txt.includes(labelText)) {
        const input = label.querySelector('input, textarea, select');
        if (!input) return false;
        const tag = input.tagName.toLowerCase();
        const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : tag === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }, labelText, value);
  if (!ok) throw new Error('Field not found: ' + labelText);
}

const client = await page.target().createCDPSession();
const downloadPath = process.cwd();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });

await page.goto(base + '/login', { waitUntil: 'networkidle0' });
await setField('Work email', 'nick.panyard@inetlte.com');
await setField('Password', 'RapidQuote!23');
await clickByText('button', 'Sign in');
await page.waitForNavigation({ waitUntil: 'networkidle0' });

await page.goto(base + '/new', { waitUntil: 'networkidle0' });
await setField('Proposal #', 'RQ-PDF-QA-001');
await setField('Proposal title', 'PDF QA Proposal');
await setField('Customer name', 'PDF QA Customer');
await setField('Contact name', 'Pat Printer');
await setField('Contact email', 'pat@example.com');
await setField('Contact phone', '555-1111');
await setField('Prepared by', 'Nick Panyard');
await setField('Sales email', 'nick.panyard@inetlte.com');
await setField('Sales phone', '555-2222');
await clickByText('button', 'Save Draft');
await page.goto(base + '/proposal', { waitUntil: 'networkidle0' });

const before = new Set((await fs.readdir(downloadPath)).filter(name => name.endsWith('.pdf')));
await clickByText('button', 'Download PDF');
await new Promise(resolve => setTimeout(resolve, 4000));
const after = (await fs.readdir(downloadPath)).filter(name => name.endsWith('.pdf'));
const newFiles = after.filter(name => !before.has(name));

const result = {
  newFiles,
  consoleMessages,
  pageErrors,
  url: page.url(),
  bodyText: await page.evaluate(() => document.body.innerText),
};

await browser.close();
await fs.writeFile('_pdf_review/verify-pdf-dev.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

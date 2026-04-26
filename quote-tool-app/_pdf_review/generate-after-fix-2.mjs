import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
const base = 'http://localhost:3000';
async function clickByText(selector, text) { const els = await page.$$(selector); for (const el of els) { const v = await page.evaluate(el => (el.innerText || el.textContent || '').trim(), el); if (v.includes(text)) { await el.click(); return true; } } return false; }
async function setField(labelText, value) { const ok = await page.evaluate((labelText, value) => { const labels = [...document.querySelectorAll('label')]; for (const label of labels) { const span = label.querySelector('span'); const txt = (span?.textContent || label.textContent || '').trim(); if (txt.includes(labelText)) { const input = label.querySelector('input, textarea, select'); if (!input) return false; const tag = input.tagName.toLowerCase(); const proto = tag === 'textarea' ? HTMLTextAreaElement.prototype : tag === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set; setter?.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; } } return false; }, labelText, value); if (!ok) throw new Error('Field not found: ' + labelText); }

await page.goto(base + '/login', { waitUntil: 'networkidle0' });
await setField('Work email', 'nick.panyard@inetlte.com');
await setField('Password', 'RapidQuote!23');
await clickByText('button', 'Sign in');
await page.waitForNavigation({ waitUntil: 'networkidle0' });
await page.goto(base + '/new', { waitUntil: 'networkidle0' });
await setField('Proposal #', 'RQ-PDF-PAGEBREAK-2');
await setField('Proposal title', 'PDF Page Break Test Proposal 2');
await setField('Proposal date', '2026-04-22');
await setField('Customer name', 'Boundary Test Customer');
await setField('Contact name', 'Morgan Example');
await setField('Contact phone', '555-1001');
await setField('Contact email', 'morgan@example.com');
await setField('Address line 1', '200 Very Long Industrial Parkway');
await setField('Prepared by', 'Nick Panyard');
await setField('Sales phone', '555-0200');
await setField('Sales email', 'nick.panyard@inetlte.com');
for (let i = 0; i < 10; i++) await clickByText('button', 'Add customer detail');
await page.evaluate(() => {
  const wrappers = [...document.querySelectorAll('[data-custom-field-id]')];
  wrappers.forEach((wrap, idx) => {
    const inputs = wrap.querySelectorAll('input');
    const [label, value] = inputs;
    if (label && value) {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(label, 'Detail ' + (idx + 1));
      label.dispatchEvent(new Event('input', { bubbles: true }));
      label.dispatchEvent(new Event('change', { bubbles: true }));
      set?.call(value, 'Extended filler copy for pagination verification. Extended filler copy for pagination verification. Extended filler copy for pagination verification.');
      value.dispatchEvent(new Event('input', { bubbles: true }));
      value.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
});
await clickByText('button', 'Save Draft');
await page.goto(base + '/proposal/print', { waitUntil: 'networkidle0' });
await page.emulateMediaType('print');
await page.setViewport({ width: 1400, height: 1800, deviceScaleFactor: 1 });
await page.screenshot({ path: 'after-fix-2.png', fullPage: true });
await page.pdf({ path: 'after-fix-2.pdf', format: 'Letter', printBackground: true, preferCSSPageSize: true });
const metrics = await page.evaluate(() => {
  const pageEl = document.querySelector('.proposal-info-page');
  const grid = document.querySelector('.proposal-info-page .proposal-address-grid');
  const custom = document.querySelector('.proposal-info-page .proposal-copy-card:last-of-type');
  if (!pageEl || !grid) return { ok: false, body: document.body.innerText.slice(0, 1000) };
  const pr = pageEl.getBoundingClientRect();
  const gr = grid.getBoundingClientRect();
  const cr = custom?.getBoundingClientRect();
  return {
    ok: true,
    pageTop: pr.top + window.scrollY,
    pageBottom: pr.bottom + window.scrollY,
    customBottom: cr ? cr.bottom + window.scrollY : null,
    gridTop: gr.top + window.scrollY,
    gridBottom: gr.bottom + window.scrollY,
    spaceBeforeGrid: (gr.top - pr.top),
    remainingAfterGrid: (pr.bottom - gr.bottom),
    cards: [...document.querySelectorAll('.proposal-info-page .proposal-address-grid > .proposal-copy-card')].map((el) => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, height: r.height, breakInside: getComputedStyle(el).breakInside, text: (el.textContent||'').trim().slice(0,100) }; })
  };
});
await fs.writeFile('after-fix-2-metrics.json', JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();

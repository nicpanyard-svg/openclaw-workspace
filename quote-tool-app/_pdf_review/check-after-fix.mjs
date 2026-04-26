import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();
await page.goto('http://localhost:3000/proposal/print', { waitUntil: 'networkidle0' });
await page.emulateMediaType('print');
await page.setViewport({ width: 1400, height: 1800, deviceScaleFactor: 1 });
await page.screenshot({ path: 'after-fix.png', fullPage: true });
await page.pdf({ path: 'after-fix.pdf', format: 'Letter', printBackground: true, preferCSSPageSize: true });
const metrics = await page.evaluate(() => {
  const pageEl = document.querySelector('.proposal-info-page');
  const grid = document.querySelector('.proposal-info-page .proposal-address-grid');
  const cards = [...document.querySelectorAll('.proposal-info-page .proposal-address-grid > .proposal-copy-card')];
  const headingRects = [...document.querySelectorAll('.proposal-info-page .proposal-address-grid .proposal-mini-heading')].map((el) => {
    const r = el.getBoundingClientRect();
    return { text: (el.textContent || '').trim(), top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
  });
  if (!pageEl || !grid) return { ok: false };
  const pr = pageEl.getBoundingClientRect();
  const gr = grid.getBoundingClientRect();
  const cardRects = cards.map((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, height: r.height, text: (el.textContent || '').trim().slice(0, 80) };
  });
  return {
    ok: true,
    pageTop: pr.top + window.scrollY,
    pageBottom: pr.bottom + window.scrollY,
    gridTop: gr.top + window.scrollY,
    gridBottom: gr.bottom + window.scrollY,
    gridHeight: gr.height,
    cardRects,
    headingRects,
    printStyles: {
      gridBreakInside: getComputedStyle(grid).breakInside,
      firstCardBreakInside: cards[0] ? getComputedStyle(cards[0]).breakInside : null,
      firstHeadingBreakAfter: document.querySelector('.proposal-info-page .proposal-address-grid .proposal-mini-heading') ? getComputedStyle(document.querySelector('.proposal-info-page .proposal-address-grid .proposal-mini-heading')).breakAfter : null,
    }
  };
});
await fs.writeFile('after-fix-metrics.json', JSON.stringify(metrics, null, 2));
console.log(JSON.stringify(metrics, null, 2));
await browser.close();

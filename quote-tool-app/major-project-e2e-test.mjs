import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
const base = 'http://localhost:3003';
const findings = { steps: [], consoleMessages: [], pageErrors: [], downloads: [] };
page.on('console', msg => findings.consoleMessages.push({ type: msg.type(), text: msg.text() }));
page.on('pageerror', err => findings.pageErrors.push(String(err)));
const cdp = await page.target().createCDPSession();
await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: process.cwd() });

function step(name, data = {}) { findings.steps.push({ name, ...data }); }
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function textIncludes(text) { return page.evaluate(t => document.body.innerText.includes(t), text); }
async function clickByText(selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const v = await page.evaluate(el => (el.innerText || el.textContent || '').trim(), el);
    if (v.includes(text)) { await el.click(); return true; }
  }
  return false;
}
async function clickLinkByHrefPart(hrefPart) {
  const links = await page.$$('a[href]');
  for (const link of links) {
    const href = await page.evaluate(el => el.getAttribute('href') || '', link);
    if (href.includes(hrefPart)) {
      await link.click();
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
async function fieldValue(labelText) {
  return page.evaluate((labelText) => {
    const labels = [...document.querySelectorAll('label')];
    for (const label of labels) {
      const span = label.querySelector('span');
      const txt = (span?.textContent || label.textContent || '').trim();
      if (txt.includes(labelText)) {
        const input = label.querySelector('input, textarea, select');
        return input ? input.value : null;
      }
    }
    return null;
  }, labelText);
}

try {
  await page.goto(base + '/login', { waitUntil: 'networkidle0' });
  await setField('Work email', 'nick.panyard@inetlte.com');
  await setField('Password', 'RapidQuote!23');
  await clickByText('button', 'Sign in');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  step('login', { url: page.url() });

  await page.goto(base + '/new?mode=new', { waitUntil: 'networkidle0' });
  step('new_builder_loaded', {
    url: page.url(),
    hasStartCard: await textIncludes('Create a new customer'),
    hasSelectCard: await textIncludes('Select existing customer'),
    hasCustomerNameField: await textIncludes('Customer name')
  });

  if (await textIncludes('Create Customer')) {
    await clickByText('button', 'Create Customer');
    await wait(500);
  }

  await page.screenshot({ path: 'rapidquote-new-debug.png', fullPage: true });
  step('new_debug_snapshot', {
    bodySnippet: await page.evaluate(() => document.body.innerText.slice(0, 1200))
  });

  await setField('Customer name', 'North Ridge Pipeline');
  await setField('Contact name', 'Avery Cole');
  await setField('Contact phone', '555-3100');
  await setField('Contact email', 'avery.cole@northridge.example');
  await setField('Address line 1', '1200 Compressor Way');
  await setField('Customer short name', 'North Ridge');
  await clickByText('button', 'Use this customer');
  await wait(700);
  step('customer_intake_filled', {
    customerName: await fieldValue('Customer name'),
    proposalFieldVisible: await textIncludes('Proposal #')
  });

  await setField('Proposal #', 'RQ-MAJOR-E2E-001');
  await setField('Proposal date', '2026-05-05');
  await setField('Proposal title', 'Major Project E2E Test Proposal');
  await setField('Proposal subtitle', 'Major Project Commercial Proposal');

  await clickByText('button', 'Major Project');
  await wait(500);
  step('major_project_enabled', {
    hasProjectName: await textIncludes('Project name'),
    hasSimpleBuilder: await textIncludes('Simple Major Project builder'),
    hasAddRow: await textIncludes('Add row')
  });

  await setField('Project name', 'North Ridge Compression Connectivity Refresh');
  await setField('Version label', 'Commercial Model v2');
  await setField('Payment terms', 'Net 30');
  await setField('Billing start', 'Upon activation');
  await setField('Project description', '12-site managed connectivity refresh across compressor stations with hardware, install, and managed service.');
  await setField('Commercial assumptions', 'Budgetary internal commercial model for a 12-site compression network refresh.');
  await setField('Term (months)', '36');
  await setField('Option label', 'Base 12-site rollout');
  await setField('Option description', 'Base deployment for 12 compressor stations');
  await setField('Sites', '12');

  await clickByText('button', 'Add row');
  await clickByText('button', 'Add row');
  await clickByText('button', 'Add row');
  await wait(500);

  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div')]
      .filter(card => (card.innerText || '').includes('Quote row '));

    const rowData = [
      { label: 'Managed connectivity service', bucket: 'mrr', qty: '12', unit: 'site', customerUnitPrice: '350', ourUnitCost: '180', description: 'Monthly managed connectivity across 12 stations' },
      { label: 'Deployment package', bucket: 'hardware', qty: '12', unit: 'site', customerUnitPrice: '1800', ourUnitCost: '1300', description: 'Hardware procurement package' },
      { label: 'Field installation', bucket: 'install', qty: '12', unit: 'site', customerUnitPrice: '2200', ourUnitCost: '1400', description: 'Field deployment and commissioning labor' }
    ];

    function setLabeled(card, labelText, value) {
      const labels = [...card.querySelectorAll('label')];
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
    }

    cards.slice(0, rowData.length).forEach((card, i) => {
      const row = rowData[i];
      setLabeled(card, 'Label', row.label);
      setLabeled(card, 'Bucket', row.bucket);
      setLabeled(card, 'Qty', row.qty);
      setLabeled(card, 'Unit', row.unit);
      setLabeled(card, 'Customer unit price', row.customerUnitPrice);
      setLabeled(card, 'Our unit cost', row.ourUnitCost);
      setLabeled(card, 'Description', row.description);
    });
  });
  await wait(700);
  step('simple_rows_added', {
    hasRecurringRow: await textIncludes('Managed connectivity service'),
    hasHardwareRow: await textIncludes('Deployment package'),
    hasInstallRow: await textIncludes('Field installation')
  });

  await clickByText('button', 'Save Draft');
  await wait(1500);
  step('draft_saved', { url: page.url() });

  const previewOpened = await clickLinkByHrefPart('/proposal');
  if (!previewOpened) {
    throw new Error('Preview Proposal link not found');
  }
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  step('preview_loaded', {
    url: page.url(),
    hasCustomer: await textIncludes('North Ridge Pipeline'),
    hasTitle: await textIncludes('Major Project E2E Test Proposal'),
    hasRecurringLine: await textIncludes('Managed connectivity service'),
    hasHardwareLine: await textIncludes('Deployment package'),
    hasInstallLine: await textIncludes('Field installation')
  });

  const beforeFiles = new Set(await fs.readdir(process.cwd()));
  const responsePromise = page.waitForResponse(resp => resp.url().includes('/api/proposal-pdf') && resp.request().method() === 'POST', { timeout: 30000 });
  await clickByText('button', 'Download PDF');
  const response = await responsePromise;
  const pdfStatus = response.status();
  const contentType = response.headers()['content-type'] || '';
  await wait(4000);
  const afterFiles = await fs.readdir(process.cwd());
  const newFiles = afterFiles.filter(f => !beforeFiles.has(f) && f.toLowerCase().endsWith('.pdf'));
  findings.downloads.push(...newFiles);
  step('pdf_attempt', { pdfStatus, contentType, newFiles });
} catch (error) {
  step('fatal_error', { message: String(error), url: page.url() });
}

await fs.writeFile('major-project-e2e-results.json', JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
await browser.close();

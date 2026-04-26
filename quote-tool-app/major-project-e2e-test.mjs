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
async function readMappingSummary() {
  return page.evaluate(() => {
    const body = document.body.innerText;
    const idx = body.indexOf('Mapping integrity');
    if (idx === -1) return null;
    return body.slice(idx, idx + 1200);
  });
}

try {
  await page.goto(base + '/login', { waitUntil: 'networkidle0' });
  await setField('Work email', 'nick.panyard@inetlte.com');
  await setField('Password', 'RapidQuote!23');
  await clickByText('button', 'Sign in');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  step('login', { url: page.url() });

  await page.goto(base + '/new?mode=new', { waitUntil: 'networkidle0' });
  step('new_builder_loaded', { hasMajorProjectToggle: await textIncludes('Major Project') });

  await setField('Proposal #', 'RQ-MAJOR-E2E-001');
  await setField('Proposal date', '2026-04-25');
  await setField('Proposal title', 'Major Project E2E Test Proposal');
  await setField('Customer name', 'North Ridge Pipeline');
  await setField('Contact name', 'Avery Cole');
  await setField('Contact phone', '555-3100');
  await setField('Contact email', 'avery.cole@northridge.example');
  await setField('Address line 1', '1200 Compressor Way');
  await setField('Proposal subtitle', 'Major Project Commercial Proposal');
  await setField('Customer short name', 'North Ridge');

  await clickByText('button', 'Major Project');
  await wait(500);
  step('major_project_enabled', {
    workflow: await page.evaluate(() => document.body.innerText.includes('Major Project is driving the downstream proposal sections.'))
  });

  await setField('Project name', 'North Ridge Compression Connectivity Refresh');
  await setField('Version label', 'Commercial Model v2');
  await setField('Payment terms', 'Net 30');
  await setField('Billing start', 'Upon activation');
  await setField('Project description', '12-site managed connectivity refresh across compressor stations with hardware, install, and managed service.');
  await setField('Commercial assumptions', 'Budgetary internal commercial model for a 12-site compression network refresh.');
  await setField('Term (months)', '36');
  await setField('Service mix', 'managed-network');
  await setField('Option label', 'Base 12-site rollout');
  await setField('Option description', 'Base deployment for 12 compressor stations');
  await setField('Sites', '12');
  await setField('MRR / site', '0');
  await setField('Hardware / site', '0');
  await setField('Install / site', '0');
  await setField('Other one-time / site', '0');
  await setField('Vendor recurring / site', '0');
  await setField('Support recurring / site', '0');
  await setField('Other recurring / site', '0');

  // Add components
  await clickByText('button', 'Add component');
  await clickByText('button', 'Add component');
  await clickByText('button', 'Add component');
  await clickByText('button', 'Add component');
  await wait(300);

  // Fill components in page context for precision.
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div')]
      .filter(card => (card.innerText || '').includes('Component '));
    const data = [
      { internalName: 'Starlink hardware kit', customerLabel: 'Station connectivity hardware', vendor: 'Starlink', manufacturer: 'SpaceX', category: 'hardware', lineType: 'hardware', schedule: 'one_time', qty: '12', unit: 'ea', customerUnitPrice: '1800', vendorUnitCost: '1300' },
      { internalName: 'Mounting and install labor', customerLabel: 'Field deployment labor', vendor: 'iNet Services', manufacturer: 'iNet', category: 'labor', lineType: 'installation', schedule: 'one_time', qty: '12', unit: 'site', customerUnitPrice: '2200', vendorUnitCost: '1400' },
      { internalName: 'Managed network service', customerLabel: 'Managed connectivity service', vendor: 'iNet', manufacturer: 'iNet', category: 'service', lineType: 'managed_service', schedule: 'recurring', qty: '12', unit: 'site', customerUnitPrice: '350', vendorUnitCost: '180' },
      { internalName: 'Project management', customerLabel: 'Program management', vendor: 'iNet', manufacturer: 'iNet', category: 'service', lineType: 'optional_service', schedule: 'one_time', qty: '1', unit: 'lot', customerUnitPrice: '6500', vendorUnitCost: '3500' }
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
    cards.slice(0, data.length).forEach((card, i) => {
      const item = data[i];
      setLabeled(card, 'Internal name', item.internalName);
      setLabeled(card, 'Customer label', item.customerLabel);
      setLabeled(card, 'Vendor', item.vendor);
      setLabeled(card, 'Manufacturer', item.manufacturer);
      setLabeled(card, 'Category', item.category);
      setLabeled(card, 'Line type', item.lineType);
      setLabeled(card, 'Schedule', item.schedule);
      setLabeled(card, 'Qty', item.qty);
      setLabeled(card, 'Unit', item.unit);
      setLabeled(card, 'Customer unit price', item.customerUnitPrice);
      setLabeled(card, 'Vendor unit cost', item.vendorUnitCost);
    });
  });
  await wait(500);
  step('components_added', { mapping: await readMappingSummary() });

  // Add bundles
  await clickByText('button', '2. Bundles');
  await wait(200);
  await clickByText('button', 'Add bundle');
  await clickByText('button', 'Add bundle');
  await wait(300);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div')]
      .filter(card => (card.innerText || '').includes('Internal bundle'));
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
    const bundleData = [
      { internalName: 'Station hardware and install', customerFacingLabel: 'Deployment package', category: 'solution', schedule: 'one_time', description: 'Hardware plus field installation' },
      { internalName: 'Managed service term', customerFacingLabel: 'Managed connectivity service', category: 'service', schedule: 'recurring', description: 'Monthly managed service' }
    ];
    cards.slice(0, bundleData.length).forEach((card, i) => {
      const item = bundleData[i];
      setLabeled(card, 'Internal name', item.internalName);
      setLabeled(card, 'Customer-facing label', item.customerFacingLabel);
      setLabeled(card, 'Category', item.category);
      setLabeled(card, 'Schedule', item.schedule);
      setLabeled(card, 'Description', item.description);
      const labels = [...card.querySelectorAll('label')];
      for (const label of labels) {
        const txt = (label.textContent || '').trim();
        if (i === 0 && (txt.includes('Starlink hardware kit') || txt.includes('Mounting and install labor') || txt.includes('Project management'))) {
          const input = label.querySelector('input[type="checkbox"]');
          if (input && !input.checked) input.click();
        }
        if (i === 1 && txt.includes('Managed network service')) {
          const input = label.querySelector('input[type="checkbox"]');
          if (input && !input.checked) input.click();
        }
      }
    });
  });
  await wait(500);
  step('bundles_added', { mapping: await readMappingSummary() });

  // Add quote lines
  await clickByText('button', '3. Quote lines');
  await wait(200);
  await clickByText('button', 'Add quote line');
  await clickByText('button', 'Add quote line');
  await clickByText('button', 'Add quote line');
  await wait(300);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div')]
      .filter(card => (card.innerText || '').includes('Customer quote line'));
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
    const lineData = [
      { label: 'Managed connectivity service', category: 'recurring', schedule: 'recurring', description: 'Monthly managed connectivity across 12 stations', bundleIncludes: ['Managed service term'] },
      { label: 'Deployment package', category: 'hardware', schedule: 'one_time', description: 'Hardware procurement and field install package', bundleIncludes: ['Station hardware and install'] },
      { label: 'Program management', category: 'services', schedule: 'one_time', description: 'Project coordination and rollout management', bundleIncludes: [] }
    ];
    cards.slice(0, lineData.length).forEach((card, i) => {
      const item = lineData[i];
      setLabeled(card, 'Quote line label', item.label);
      setLabeled(card, 'Presentation category', item.category);
      setLabeled(card, 'Schedule', item.schedule);
      setLabeled(card, 'Description / proposal note', item.description);
      const labels = [...card.querySelectorAll('label')];
      for (const label of labels) {
        const txt = (label.textContent || '').trim();
        if (item.bundleIncludes.some(name => txt.includes(name))) {
          const input = label.querySelector('input[type="checkbox"]');
          if (input && !input.checked) input.click();
        }
        if (i === 2 && txt.includes('Project management')) {
          const input = label.querySelector('input[type="checkbox"]');
          if (input && !input.checked) input.click();
        }
      }
    });
  });
  await wait(700);
  const mappingAfter = await readMappingSummary();
  step('quote_lines_added', { mapping: mappingAfter });

  await clickByText('button', 'Save Draft');
  await wait(700);
  await page.reload({ waitUntil: 'networkidle0' });
  step('after_reload', {
    proposalNumber: await fieldValue('Proposal #'),
    projectName: await fieldValue('Project name'),
    sites: await fieldValue('Sites'),
    mapping: await readMappingSummary()
  });

  await clickByText('a', 'Preview Proposal');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  step('preview_loaded', {
    url: page.url(),
    hasCustomer: await textIncludes('North Ridge Pipeline'),
    hasTitle: await textIncludes('Major Project E2E Test Proposal'),
    hasRecurringLine: await textIncludes('Managed connectivity service'),
    hasHardwareLine: await textIncludes('Deployment package'),
    hasProgramMgmt: await textIncludes('Program management')
  });

  // Download PDF
  const beforeFiles = new Set(await fs.readdir(process.cwd()));
  const responsePromise = page.waitForResponse(resp => resp.url().includes('/api/proposal-pdf') && resp.request().method() === 'POST', { timeout: 20000 });
  await clickByText('button', 'Download PDF');
  const response = await responsePromise;
  let pdfStatus = response.status();
  let pdfBody = '';
  try { pdfBody = await response.text(); } catch {}
  await wait(3000);
  const afterFiles = await fs.readdir(process.cwd());
  const newFiles = afterFiles.filter(f => !beforeFiles.has(f) && f.toLowerCase().endsWith('.pdf'));
  findings.downloads.push(...newFiles);
  step('pdf_attempt', { pdfStatus, newFiles, bodySnippet: pdfBody.slice(0, 300) });

  // Print view sanity
  await page.goto(base + '/proposal/print', { waitUntil: 'networkidle0' });
  step('print_view_loaded', {
    hasPrintView: await textIncludes('North Ridge Pipeline'),
    hasRecurringLine: await textIncludes('Managed connectivity service'),
    hasHardwareLine: await textIncludes('Deployment package')
  });

  // Return to dashboard to see proposal surface
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  step('dashboard_loaded', { hasLaunchpad: await textIncludes('Proposal launchpad') });
} catch (error) {
  step('fatal_error', { message: String(error), url: page.url() });
}

await fs.writeFile('major-project-e2e-results.json', JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
await browser.close();

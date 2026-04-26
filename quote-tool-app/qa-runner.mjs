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
page.on('console', msg => consoleMessages.push({type: msg.type(), text: msg.text()}));
page.on('pageerror', err => pageErrors.push(String(err)));

async function textIncludes(text) {
  return page.evaluate((t) => document.body.innerText.includes(t), text);
}
async function clickByText(selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const v = await page.evaluate(el => (el.innerText || el.textContent || '').trim(), el);
    if (v.includes(text)) { await el.click(); return true; }
  }
  return false;
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

const findings = { steps: [], consoleMessages, pageErrors };
function step(name, data = {}) { findings.steps.push({ name, ...data }); }

await page.goto(base + '/login', { waitUntil: 'networkidle0' });
step('login_page_load', { url: page.url(), hasSignIn: await textIncludes('Sign in to RapidQuote') });

// bad login
await setField('Work email', 'bad@inetlte.com');
await setField('Password', 'wrongpass');
await clickByText('button', 'Sign in');
await page.waitForFunction(() => document.body.innerText.includes('Email or password did not match'));
step('bad_login_error', { ok: true });

// forgot password flow
await clickByText('a', 'Reset it here');
await page.waitForNavigation({ waitUntil: 'networkidle0' });
await setField('Work email', 'nick.panyard@inetlte.com');
await clickByText('button', 'Continue');
await page.waitForFunction(() => document.body.innerText.includes('Recovery request prepared'));
step('forgot_password_known_user', { msgPresent: true });
await clickByText('a', 'Open reset form');
await page.waitForNavigation({ waitUntil: 'networkidle0' });
await setField('New password', 'short');
await setField('Confirm password', 'short');
await clickByText('button', 'Save new password');
await page.waitForFunction(() => document.body.innerText.includes('Use at least 10 characters'));
step('reset_short_password_validation', { ok: true });
await setField('New password', 'LongEnough123');
await setField('Confirm password', 'Mismatch12345');
await clickByText('button', 'Save new password');
await page.waitForFunction(() => document.body.innerText.includes('Passwords must match'));
step('reset_mismatch_validation', { ok: true });
await setField('New password', 'LongEnough123');
await setField('Confirm password', 'LongEnough123');
await clickByText('button', 'Save new password');
await page.waitForFunction(() => document.body.innerText.includes('Password update accepted on the product surface'));
step('reset_success_surface', { ok: true });

// signup external/internal
await page.goto(base + '/signup', { waitUntil: 'networkidle0' });
await setField('Full name', 'Alex Outside');
await setField('Work email', 'alex@outside.com');
await setField('Team', 'Partner');
await setField('Role needed', 'Reviewer');
await setField('Why do you need access?', 'Need access for customer quote review.');
await clickByText('button', 'Request access');
await page.waitForFunction(() => document.body.innerText.includes('internal-only today'));
step('signup_external_denied_surface', { ok: true });
await setField('Full name', 'Terry Inside');
await setField('Work email', 'terry@inetlte.com');
await setField('Team', 'Sales');
await setField('Role needed', 'AE');
await setField('Why do you need access?', 'Need to build proposals.');
await clickByText('button', 'Request access');
await page.waitForFunction(() => document.body.innerText.includes('Access request captured for terry@inetlte.com'));
step('signup_internal_pending_surface', { ok: true });

// login valid
await page.goto(base + '/login', { waitUntil: 'networkidle0' });
await setField('Work email', 'nick.panyard@inetlte.com');
await setField('Password', 'RapidQuote!23');
await clickByText('button', 'Sign in');
await page.waitForNavigation({ waitUntil: 'networkidle0' });
step('login_success', { url: page.url(), hasDashboard: await textIncludes('Proposal launchpad') });

// access page as non-admin
await page.goto(base + '/access', { waitUntil: 'networkidle0' });
step('access_non_admin', { text: await page.evaluate(() => document.body.innerText) });

// builder edits
await page.goto(base + '/new', { waitUntil: 'networkidle0' });
await setField('Proposal #', 'RQ-QA-001');
await setField('Proposal title', 'RapidQuote QA Proposal');
await setField('Proposal date', '2026-04-21');
await setField('Customer name', 'QA Test Energy');
await setField('Contact name', 'Jamie Tester');
await setField('Contact phone', '555-0100');
await setField('Contact email', 'jamie.tester@example.com');
await setField('Address line 1', '100 Main St');
await setField('Prepared by', 'Nick Panyard');
await setField('Sales phone', '555-0200');
await setField('Sales email', 'nick.panyard@inetlte.com');
await clickByText('button', 'Generate draft summary');
await clickByText('button', 'Add customer detail');
await page.evaluate(() => {
  const labels = [...document.querySelectorAll('label')];
  const labelInputs = labels
    .filter(label => (label.textContent || '').includes('Customer-facing'))
    .map(label => label.querySelector('input'))
    .filter(Boolean);
  const [first, second] = labelInputs;
  if (first) {
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    s?.call(first, 'Site Count');
    first.dispatchEvent(new Event('input', { bubbles: true }));
    first.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (second) {
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    s?.call(second, '12 remote locations');
    second.dispatchEvent(new Event('input', { bubbles: true }));
    second.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await clickByText('button', 'Quick add 1 TB');
// choose first hardware add button
const addButtons = await page.$$('button');
for (const b of addButtons) {
  const t = await page.evaluate(el => (el.innerText || '').trim(), b);
  if (t === 'Add to Hardware Rows') { await b.click(); break; }
}
await clickByText('button', 'Add service row');
await clickByText('button', 'Save Draft');
await page.reload({ waitUntil: 'networkidle0' });
step('builder_persistence_after_reload', {
  proposalNumber: await fieldValue('Proposal #'),
  customerName: await fieldValue('Customer name'),
  hasSummary: await textIncludes('Executive Summary')
});

// copy proposal and inspect clearing behavior
await clickByText('button', 'Copy Proposal');
await new Promise((resolve) => setTimeout(resolve, 500));
step('copy_proposal_builder_state', {
  customerName: await fieldValue('Customer name'),
  proposalNumber: await fieldValue('Proposal #'),
  title: await fieldValue('Proposal title')
});

// preview/output
await page.goto(base + '/proposal', { waitUntil: 'networkidle0' });
step('preview_page', {
  hasTitle: await textIncludes('RapidQuote QA Proposal'),
  hasCustomer: await textIncludes('QA Test Energy'),
  hasCustomField: await textIncludes('Site Count'),
  hasPreparedBy: await textIncludes('Nick Panyard')
});

// intercept word export
const client = await page.target().createCDPSession();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: process.cwd() });
await clickByText('button', 'Export Word');
await new Promise((resolve) => setTimeout(resolve, 1500));
const files = await fs.readdir(process.cwd());
const docx = files.filter(f => f.endsWith('.docx'));
step('word_export', { files: docx });

// print page direct
await page.goto(base + '/proposal/print', { waitUntil: 'networkidle0' });
step('print_page', {
  hasPrintTitle: await textIncludes('Print Proposal'),
  hasCustomer: await textIncludes('QA Test Energy')
});

// detail page + dashboard copy
await page.goto(base + '/', { waitUntil: 'networkidle0' });
await clickByText('a', 'All Proposals');
await clickByText('a', 'Open Editor');
step('dashboard_open_editor', { url: page.url() });

await browser.close();
await fs.writeFile('qa-results.json', JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings, null, 2));
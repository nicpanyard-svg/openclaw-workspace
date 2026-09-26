import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { PROPOSAL_STORE_KEY, ACTIVE_PROPOSAL_ID_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { quoteMasterFixtures } from "./quote-master-fixtures";

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve(`tmp/quote-master-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((candidate) => candidate && existsSync(candidate));
  assert.ok(executablePath);
  const selections = quoteMasterFixtures();
  const quote = selections[0].quote;
  const session = buildSession({ id: "qa-master", name: "QA Account Manager", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const store = { currentUser: session.user, users: [session.user], proposals: selections.map(({ quote }) => createProposalFromQuote({ quote, currentUser: session.user, owner: session.user })) };
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    const seedScript = await page.evaluateOnNewDocument((state) => {
      localStorage.setItem(state.directoryKey, state.directory);
      localStorage.setItem(state.authKey, state.session);
      localStorage.setItem(state.fallbackKey, state.quote);
      localStorage.setItem(state.storeKey, state.store);
      localStorage.setItem(state.activeKey, state.activeId);
      sessionStorage.setItem(state.quoteKey, state.quote);
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...session.user, password: "synthetic-qa-only" }]), authKey: AUTH_STORAGE_KEY, session: JSON.stringify(session), fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY, quote: JSON.stringify(quote), storeKey: PROPOSAL_STORE_KEY, store: JSON.stringify(store), activeKey: ACTIVE_PROPOSAL_ID_KEY, activeId: quote.internal.quoteId! });
    const cdp = await browser.target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });

    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "networkidle0", timeout: 90000 });
    await page.waitForSelector('.rq-editor-actions');
    await page.removeScriptToEvaluateOnNewDocument(seedScript.identifier);
    await page.$$eval('.rq-editor-actions button', buttons => buttons.find(b => b.textContent?.trim() === 'Finish setup')!.click());
    await page.waitForSelector('nav[aria-label="Quote setup steps"]');
    assert.equal(await page.$eval('#rq-nav-customer', el => el.getAttribute('aria-current')), 'page');
    assert.equal(await page.$$eval('section[aria-label="Required quote information"]', forms => forms.length), 1, 'Setup should have one mounted form');
    const api = await page.evaluate(async quote => { const response = await fetch('/api/proposal-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote }) }); return { status: response.status, body: await response.json() }; }, quote);
    assert.equal(api.status, 422);
    assert.ok(api.body.missingFields.includes('Corporate pricing decision'));
    const fill = async (label: string, value: string) => page.evaluate(({ label, value }) => {
      const form = [...document.querySelectorAll('section[aria-label="Required quote information"]')].find(el => (el as HTMLElement).offsetHeight > 0)!;
      const field = [...form.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === label)!;
      if (!field) throw new Error('Missing field '+label+'; visible labels: '+[...form.querySelectorAll('label span')].map(el=>el.textContent).join(', '));
      const input = field.querySelector('input,select,textarea')! as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }, { label, value });
    const fieldValue = (label: string) => page.evaluate(label => {
      const form = document.querySelector('section[aria-label="Required quote information"]')!;
      const field = [...form.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === label);
      if (!field) throw new Error('Missing field ' + label);
      return (field.querySelector('input,select,textarea') as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
    }, label);
    const expectFields = async (present: string[], absent: string[]) => {
      const labels = await page.$$eval('section[aria-label="Required quote information"] label span', spans => spans.map(span => span.textContent));
      for (const label of present) assert.ok(labels.includes(label), `Active step is missing ${label}`);
      for (const label of absent) assert.ok(!labels.includes(label), `Inactive step field is mounted: ${label}`);
    };
    const next = async (label: string) => {
      assert.equal(await page.$eval('.rq-setup-next', button => button.textContent?.trim()), label);
      await page.click('.rq-setup-next');
    };
    const waitForField = (label: string) => page.waitForFunction(label => [...document.querySelectorAll('section[aria-label="Required quote information"] label span')].some(span => span.textContent === label), {}, label);
    await expectFields(['Sub account applicable?', 'Service address', 'POC name', 'POC phone number'], ['Data Plan/Pool', 'Shipping required?']);
    await next('Continue to Equipment');
    await page.waitForSelector('.rq-setup-error');
    await expectFields(['Sub account applicable?'], ['Radar hardware package: assembly?', 'Corporate pricing?']);
    await fill('Sub account applicable?', 'no');
    await fill('Service address', '100 Test Street');
    await fill('POC name', 'QA Contact');
    await fill('POC phone number', '555-0100');
    await next('Continue to Equipment');
    await waitForField('Radar hardware package: assembly?');
    await expectFields(['Radar hardware package: assembly?'], ['POC name', 'Data Plan/Pool', 'Shipping required?']);
    await fill('Radar hardware package: assembly?', 'assembly');
    await fill('Assembly details (optional)', 'Radar assembly QA');
    await page.$$eval('section[aria-label="Required quote information"] button', buttons => {
      const button = buttons.find(button => button.textContent?.includes('Add / edit equipment'));
      if (!button) throw new Error('Equipment editor action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('#rq-nav-items')?.getAttribute('aria-current') === 'page');
    await page.$$eval('button', buttons => {
      const button = buttons.find(button => button.textContent?.trim() === 'Return to setup' && button.offsetHeight > 0);
      if (!button) throw new Error('Line Items must provide a visible Return to setup action');
      button.click();
    });
    await waitForField('Radar hardware package: assembly?');
    assert.equal(await fieldValue('Radar hardware package: assembly?'), 'assembly');
    assert.equal(await fieldValue('Assembly details (optional)'), 'Radar assembly QA');
    await next('Continue to Plan & rates');
    await waitForField('Data Plan/Pool');
    await expectFields(['Data Plan/Pool', 'Corporate pricing?'], ['POC name', 'Radar hardware package: assembly?', 'Shipping required?']);
    await fill('Data Plan/Pool', '500GB pool');
    await fill('Corporate pricing?', 'no');
    await fill('Non-corporate pricing structure', 'individual');
    assert.equal(await fieldValue('50GB price (USD)'), '27.5');
    assert.equal(await fieldValue('TAC (terminal access charge) price (USD)'), '42');
    await fill('50GB price (USD)', '30');
    await fill('Non-corporate pricing structure', 'pool');
    assert.equal(await fieldValue('Pool TAC price (USD)'), '42');
    await fill('Non-corporate pricing structure', 'individual');
    assert.equal(await fieldValue('50GB price (USD)'), '30');
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Plan and rates should fit on mobile');
    await page.screenshot({ path: path.join(output, 'required-setup-rates-mobile.png'), fullPage: true });
    await next('Continue to Delivery');
    await waitForField('Shipping required?');
    await expectFields(['Shipping required?', 'Opt in or out of overages', 'Public IP?', 'Special instructions'], ['POC name', '50GB price (USD)', 'Radar hardware package: assembly?']);
    await fill('Opt in or out of overages', 'no');
    await fill('Public IP?', 'no');
    await fill('Shipping required?', 'no');
    await fill('Special instructions', 'None');
    await next('Continue to Review');
    await page.waitForFunction(() => document.querySelector('.rq-setup-next')?.textContent?.trim() === 'Create quote');
    await expectFields([], ['Sub account applicable?', 'POC name', 'Radar hardware package: assembly?', 'Data Plan/Pool', 'Shipping required?']);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Setup review should fit on mobile');
    await page.screenshot({ path: path.join(output, 'required-setup-mobile.png'), fullPage: true });
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), next('Create quote')]);
    await page.waitForSelector('.proposal-toolbar');
    assert.equal(new URL(page.url()).pathname, '/proposal');
    assert.equal(await page.$eval('body', el => el.textContent!.includes('Complete required quote information')), false);
    assert.deepEqual(errors, [], 'The guided flow should not emit browser errors');
    console.log(JSON.stringify({ passed: true, output, apiRejectedIncomplete: true, blockedIncompleteStep: true, equipmentRoundTrip: true, ratesEditableAndRetained: true, onlyActiveStepMounted: true, mobileNoOverflow: true, createdPreview: true }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

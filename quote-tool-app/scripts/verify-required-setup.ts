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
    await page.$$eval('.rq-editor-actions button', buttons => buttons.find(b => b.textContent?.trim() === 'Save')!.click());
    await page.waitForFunction(() => document.querySelector('.rq-notice')?.textContent?.includes('Complete required quote information'));
    assert.equal(await page.$eval('#rq-nav-customer', el => el.getAttribute('aria-current')), 'page');
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
    await fill('Sub account applicable?', 'no');
    await fill('Data Plan/Pool', '500GB pool');
    await fill('Corporate pricing?', 'no');
    await fill('Non-corporate pricing structure', 'individual');
    const rateValue = (label: string) => page.evaluate(label => { const form = [...document.querySelectorAll('section[aria-label="Required quote information"]')].find(el => (el as HTMLElement).offsetHeight > 0)!; return ([...form.querySelectorAll('label')].find(el => el.querySelector('span')?.textContent === label)!.querySelector('input') as HTMLInputElement).value; }, label);
    assert.equal(await rateValue('50GB price (USD)'), '27.5');
    assert.equal(await rateValue('TAC (terminal access charge) price (USD)'), '42');
    await fill('50GB price (USD)', '30');
    await fill('Non-corporate pricing structure', 'pool');
    assert.equal(await rateValue('Pool TAC price (USD)'), '42');
    await fill('Non-corporate pricing structure', 'individual');
    assert.equal(await rateValue('50GB price (USD)'), '30');
    await fill('Opt in or out of overages', 'no');
    await fill('Public IP?', 'no');
    await fill('Shipping required?', 'no');
    await fill('Service address', '100 Test Street');
    await fill('POC name', 'QA Contact');
    await fill('POC phone number', '555-0100');
    await fill('Special instructions', 'None');
    await fill('Radar hardware package: assembly?', 'assembly');
    await fill('Assembly details (optional)', 'Radar assembly QA');
    await page.waitForFunction(() => document.querySelector('section[aria-label="Required quote information"]')?.textContent?.includes('Required quote information complete'));
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, 'required-setup-mobile.png'), fullPage: true });
    await page.$$eval('.rq-editor-actions button', buttons => buttons.find(b => b.textContent?.trim() === 'Save')!.click());
    await page.waitForFunction(() => document.querySelector('.rq-notice')?.textContent?.includes('Draft saved'));
    await page.goto(new URL(`/proposal?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.proposal-toolbar');
    assert.equal(await page.$eval('body', el => el.textContent!.includes('Complete required quote information')), false);
    console.log(JSON.stringify({ passed: true, output, apiRejectedIncomplete: true, savedComplete: true }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

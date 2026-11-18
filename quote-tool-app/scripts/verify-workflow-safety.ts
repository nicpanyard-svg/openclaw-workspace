import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { PROPOSAL_STORE_KEY, ACTIVE_PROPOSAL_ID_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import { fixtureComponent, fixtureQuote } from "./quote-master-fixtures";
import { prepareProFormaFixture } from "./pro-forma-fixtures";

async function clickText(page: Page, selector: string, text: string) {
  await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some(el => el.textContent?.trim() === text), {}, selector, text);
  await page.$$eval(selector, (els, text) => (els.find(el => el.textContent?.trim() === text) as HTMLElement).click(), text);
}

async function enter(page: Page, selector: string, value: string) {
  await page.$eval(selector, el => el.scrollIntoView({ block: "center" }));
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 5 });
  assert.equal(await page.$eval(selector, el => (el as HTMLInputElement).value), value);
}

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve(`tmp/workflow-safety-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  assert.ok(executablePath);
  const session = buildSession({ id: "qa-workflow", name: "QA Account Manager", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const quote = applyMajorProjectToQuote(prepareProFormaFixture(fixtureQuote("QA-WORKFLOW", "Workflow verification", [
    fixtureComponent("Camera", 500, 300),
    fixtureComponent("Mounting included", 0, 15),
    fixtureComponent("Optional radar", 0, 80, { optional: true }),
  ])));
  const store = { currentUser: session.user, users: [session.user], proposals: [createProposalFromQuote({ quote, owner: session.user, currentUser: session.user })] };
  // A fresh, disposable browser profile keeps the user's actual quotes untouched.
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => errors.push(String(error)));
    page.on("dialog", dialog => void dialog.accept());
    await page.evaluateOnNewDocument(state => {
      if (localStorage.getItem("qa-workflow-seeded")) return;
      localStorage.setItem(state.directoryKey, JSON.stringify([{ ...state.session.user, password: "synthetic-qa-only" }]));
      localStorage.setItem(state.authKey, JSON.stringify(state.session));
      localStorage.setItem(state.storeKey, JSON.stringify(state.store));
      localStorage.setItem(state.activeKey, state.quote.internal.quoteId!);
      localStorage.setItem(state.fallbackKey, JSON.stringify(state.quote));
      sessionStorage.setItem(state.quoteKey, JSON.stringify(state.quote));
      localStorage.setItem("qa-workflow-seeded", "true");
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, authKey: AUTH_STORAGE_KEY, session, storeKey: PROPOSAL_STORE_KEY, store, activeKey: ACTIVE_PROPOSAL_ID_KEY, quote, fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForSelector('select[aria-label="Component 2 pricing status"]', { timeout: 90_000 });
    assert.match(await page.$eval(".rq-pricing-attention", el => el.textContent || ""), /1 required item/);
    assert.equal(await page.$eval('select[aria-label="Component 2 pricing status"]', el => (el as HTMLSelectElement).value), "tbd");
    const blocked = await page.evaluate(async quote => {
      const response = await fetch("/api/proposal-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote }) });
      return { status: response.status, text: await response.text() };
    }, quote);
    assert.equal(blocked.status, 422);
    assert.match(blocked.text, /Resolve pricing/);
    await page.select('select[aria-label="Component 2 pricing status"]', "included");
    await page.select('select[aria-label="Component 1 pricing status"]', "allowance");
    await enter(page, 'input[aria-label="Component 1 name"]', "Camera package");
    await page.waitForFunction((key, id) => {
      const saved = JSON.parse(localStorage.getItem(key) || "{}").proposals?.find((entry: { id: string }) => entry.id === id);
      const items = saved?.quote.majorProject.options[0].components;
      return items?.[0].internalName === "Camera package" && items[0].customerFacingLabel === "Camera package" && items[0].priceStatus === "allowance" && items[1].priceStatus === "included";
    }, { timeout: 30_000 }, PROPOSAL_STORE_KEY, quote.internal.quoteId);
    await page.waitForFunction(() => document.querySelector('[aria-label="Browser save and recovery"]')?.textContent?.includes("Saved to Workspace in this browser"));
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Editor overflow ${width}`);
      await page.screenshot({ path: path.join(output, `editor-${width}.png`), fullPage: false });
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.reload({ waitUntil: "networkidle0" });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForSelector('input[aria-label="Component 1 name"]');
    assert.equal(await page.$eval('input[aria-label="Component 1 name"]', el => (el as HTMLInputElement).value), "Camera package");
    await page.click('button[aria-label="Expand details for Camera package"]');
    const labelFields = '.rq-line-table__details-row:not([hidden]) .rq-linked-label';
    await page.waitForSelector(`${labelFields} input[type="checkbox"]`);
    await page.click(`${labelFields} input[type="checkbox"]`);
    await enter(page, `${labelFields} input:not([type="checkbox"])`, "Outdoor monitoring package");
    await enter(page, 'input[aria-label="Component 1 name"]', "Internal camera BOM");
    assert.equal(await page.$eval(`${labelFields} input:not([type="checkbox"])`, el => (el as HTMLInputElement).value), "Outdoor monitoring package");
    await page.waitForFunction((key, id) => JSON.parse(localStorage.getItem(key) || "{}").proposals?.find((p: { id: string }) => p.id === id)?.quote.majorProject.options[0].components[0].internalName === "Internal camera BOM", {}, PROPOSAL_STORE_KEY, quote.internal.quoteId);
    const olderTab = await browser.newPage();
    await olderTab.goto(page.url(), { waitUntil: "networkidle0" });
    await olderTab.waitForSelector('input[aria-label="Component 1 name"]');
    await page.bringToFront();
    await enter(page, 'input[aria-label="Component 1 name"]', "Current camera BOM");
    await page.waitForFunction((key, id) => JSON.parse(localStorage.getItem(key) || "{}").proposals?.find((p: { id: string }) => p.id === id)?.quote.majorProject.options[0].components[0].internalName === "Current camera BOM", {}, PROPOSAL_STORE_KEY, quote.internal.quoteId);
    await olderTab.waitForFunction(() => document.querySelector('[aria-label="Browser save and recovery"]')?.textContent?.includes("Save paused"), { polling: 100 });
    await olderTab.bringToFront();
    await enter(olderTab, 'input[aria-label="Component 1 name"]', "Stale tab edit");
    await clickText(olderTab, ".rq-editor-actions button", "Save draft");
    await olderTab.waitForFunction(() => document.querySelector('[aria-label="Browser save and recovery"]')?.textContent?.includes("Save paused"));
    assert.equal(await olderTab.evaluate((key, id) => JSON.parse(localStorage.getItem(key)!).proposals.find((p: {id:string}) => p.id === id).quote.majorProject.options[0].components[0].internalName, PROPOSAL_STORE_KEY, quote.internal.quoteId), "Current camera BOM", "An older tab cannot replace the newer saved quote");
    await olderTab.close();
    await page.bringToFront();
    await page.click('[aria-label="Browser save and recovery"] summary');
    const recoveryButtons = await page.$$('[aria-label="Browser save and recovery"] button[aria-label^="Load recovery"]');
    assert.ok(recoveryButtons.length >= 2, "Prior versions are retained");
    await recoveryButtons[recoveryButtons.length - 1].click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Browser save and recovery"]')?.textContent?.includes("Recovered draft - not saved"));
    assert.equal(await page.evaluate((key, id) => JSON.parse(localStorage.getItem(key)!).proposals.find((p: {id:string}) => p.id === id).quote.majorProject.options[0].components[0].internalName, PROPOSAL_STORE_KEY, quote.internal.quoteId), "Current camera BOM", "Recovery does not overwrite Workspace until saved");
    await page.reload({ waitUntil: "networkidle0" });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await enter(page, 'input[aria-label="Component 1 name"]', "Saved before leaving");
    await page.click('button[aria-label="Back to quotes"]');
    await page.waitForFunction(() => location.pathname === "/workspace");
    assert.equal(await page.evaluate((key, id) => JSON.parse(localStorage.getItem(key)!).proposals.find((p: {id:string}) => p.id === id).quote.majorProject.options[0].components[0].internalName, PROPOSAL_STORE_KEY, quote.internal.quoteId), "Saved before leaving", "Leaving the editor flushes pending edits");
    await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "networkidle0" });
    await page.click("#rq-nav-review");
    await clickText(page, "button", "Duplicate quote");
    await page.waitForSelector("dialog.qcopy-dialog[open]");
    await page.click('dialog input[value="different"]');
    await page.select("dialog .qcopy-retention label:nth-of-type(1) select", "remove");
    await page.select("dialog .qcopy-retention label:nth-of-type(2) select", "remove");
    await page.select("dialog .qcopy-retention label:nth-of-type(3) select", "remove");
    await page.$eval("dialog .qcopy-item:last-child input", el => (el as HTMLInputElement).click());
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      assert.equal(await page.$eval("dialog[open]", el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1), false, `Copy dialog overflow ${width}`);
      await page.screenshot({ path: path.join(output, `copy-review-${width}.png`) });
    }
    await clickText(page, "dialog button", "Create copy");
    await page.waitForFunction(() => !document.querySelector("dialog.qcopy-dialog"));
    const copiedStore = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), PROPOSAL_STORE_KEY);
    assert.equal(copiedStore.proposals.length, 2);
    const original = copiedStore.proposals.find((p: {id:string}) => p.id === quote.internal.quoteId);
    const copied = copiedStore.proposals.find((p: {id:string}) => p.id !== quote.internal.quoteId);
    assert.equal(original.quote.customer.name, "River Valley Utilities");
    assert.equal(original.quote.majorProject.options[0].components.length, 3);
    assert.equal(copied.quote.customer.name, "");
    assert.equal(copied.status, "draft");
    assert.equal(copied.quote.majorProject.options[0].components.length, 2);
    assert.notEqual(copied.quote.metadata.proposalNumber, original.quote.metadata.proposalNumber);
    assert.ok(await page.$(".rq-customer-choices"), "New customer entry is shown for copied quote");
    assert.deepEqual(errors, [], "No browser runtime errors");
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, pricing: blocked.status, quotes: copiedStore.proposals.length, errors }, null, 2));
    console.log(`Workflow checks passed: ${output}`);
  } catch (error) {
    const pages = await browser.pages();
    const page = pages[pages.length - 1];
    if (page) {
      await page.screenshot({ path: path.join(output, "failure.png") });
      await writeFile(path.join(output, "failure.txt"), `${String(error)}\n${errors.join("\n")}\n${await page.evaluate(() => document.body.innerText)}`);
      await writeFile(path.join(output, "failure-store.json"), await page.evaluate(key => localStorage.getItem(key) || "{}", PROPOSAL_STORE_KEY));
    }
    console.error(`Workflow failure details: ${output}`);
    throw error;
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

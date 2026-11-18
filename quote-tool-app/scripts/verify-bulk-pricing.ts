import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { PROPOSAL_STORE_KEY, ACTIVE_PROPOSAL_ID_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import type { QuoteRecord } from "../app/lib/quote-record";
import { fixtureComponent, fixtureQuote } from "./quote-master-fixtures";
import { prepareProFormaFixture } from "./pro-forma-fixtures";

async function clickText(page: Page, selector: string, text: string) {
  await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some(el => el.textContent?.trim() === text), {}, selector, text);
  await page.$$eval(selector, (els, text) => (els.find(el => el.textContent?.trim() === text) as HTMLElement).click(), text);
}

async function clickLabel(page: Page, label: string) {
  const selector = `[aria-label=${JSON.stringify(label)}]`;
  await page.waitForSelector(selector);
  await page.$$eval(selector, els => (els.find(el => (el as HTMLElement).offsetParent !== null) as HTMLElement).click());
}

async function enter(page: Page, selector: string, value: string) {
  await page.$eval(selector, el => el.scrollIntoView({ block: "center" }));
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value, { delay: 5 });
}

async function savedQuote(page: Page, id: string): Promise<QuoteRecord> {
  await page.waitForFunction(() => document.querySelector('[aria-label="Browser save and recovery"]')?.textContent?.includes("Saved to Workspace in this browser"), { timeout: 30_000 });
  return page.evaluate((key, id) => JSON.parse(localStorage.getItem(key)!).proposals.find((p: { id: string }) => p.id === id).quote, PROPOSAL_STORE_KEY, id);
}

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3018");
  const authorizedLiveCheck = process.env.RAPIDQUOTE_LIVE_QA === "1" && base.origin === "https://quote-tool-app.vercel.app";
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || authorizedLiveCheck);
  const output = path.resolve(`tmp/bulk-pricing-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  assert.ok(executablePath);
  const session = buildSession({ id: "qa-bulk", name: "QA Account Manager", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const quote = applyMajorProjectToQuote(prepareProFormaFixture(fixtureQuote("QA-BULK", "Bulk pricing verification", [
    fixtureComponent("Hardware", 120, 70, { quantity: 2, customerExtendedPrice: 240, vendorExtendedCost: 140 }),
    fixtureComponent("Negotiated", 95, 60, { priceLocked: true }),
    fixtureComponent("Monthly service", 25, 14, { schedule: "recurring", lineType: "subscription" }),
    fixtureComponent("Annual service", 250, 140, { schedule: "recurring", lineType: "subscription", billing: { cadence: "annual" } }),
    fixtureComponent("Included mount", 0, 20, { priceStatus: "included" }),
    fixtureComponent("Missing cost", 50, 0),
    fixtureComponent("Freight pass-through", 20, 20, { passThrough: true }),
    fixtureComponent("Pending radar", 0, 35, { priceStatus: "tbd", optional: true }),
  ])));
  const simple = prepareProFormaFixture(fixtureQuote("QA-BULK-SIMPLE", "Simple pricing verification", []));
  simple.majorProject.builderMode = "simple";
  simple.majorProject.options[0].simpleRows = [
    { id: "simple-hardware", label: "Simple hardware", bucket: "hardware", quantity: 2, customerUnitPrice: 120, customerExtendedPrice: 240, ourUnitCost: 70, ourExtendedCost: 140 },
    { id: "simple-locked", label: "Simple negotiated", bucket: "hardware", quantity: 1, customerUnitPrice: 95, customerExtendedPrice: 95, ourUnitCost: 60, ourExtendedCost: 60, priceLocked: true },
  ];
  const quotes = [quote, applyMajorProjectToQuote(simple)];
  const store = { currentUser: session.user, users: [session.user], proposals: quotes.map(quote => createProposalFromQuote({ quote, owner: session.user, currentUser: session.user })) };
  // No connection to the user's browser profile or saved quotes.
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const errors: string[] = [];
  const page = await browser.newPage();
  try {
    page.on("pageerror", error => errors.push(String(error)));
    page.on("dialog", dialog => void dialog.accept());
    await page.evaluateOnNewDocument(state => {
      if (localStorage.getItem("qa-bulk-seeded")) return;
      localStorage.setItem(state.directoryKey, JSON.stringify([{ ...state.session.user, password: "synthetic-qa-only" }]));
      localStorage.setItem(state.authKey, JSON.stringify(state.session));
      localStorage.setItem(state.storeKey, JSON.stringify(state.store));
      localStorage.setItem(state.activeKey, state.quote.internal.quoteId!);
      localStorage.setItem(state.fallbackKey, JSON.stringify(state.quote));
      sessionStorage.setItem(state.quoteKey, JSON.stringify(state.quote));
      localStorage.setItem("qa-bulk-seeded", "true");
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, authKey: AUTH_STORAGE_KEY, session, storeKey: PROPOSAL_STORE_KEY, store, activeKey: ACTIVE_PROPOSAL_ID_KEY, quote, fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForSelector('input[aria-label="Component 1 unit price"]');
    assert.deepEqual(await page.$$eval('select[aria-label="Component 1 pricing status"] option', options => options.map(option => option.textContent)), ["Price set", "Estimated price", "Needs pricing", "No extra charge"]);
    const help = await page.$eval('select[aria-label="Component 1 pricing status"]', el => document.getElementById(el.getAttribute("aria-describedby")!)?.textContent);
    assert.equal(help, "The price shown is ready to quote.");
    await page.select('select[aria-label="Component 1 pricing status"]', "included");
    assert.match(await page.$eval('select[aria-label="Component 1 pricing status"]', el => document.getElementById(el.getAttribute("aria-describedby")!)?.textContent || ""), /Enter \$0 for No extra charge/);
    assert.equal(await page.$eval('input[aria-label="Component 1 unit price"]', el => (el as HTMLInputElement).value), "120", "Wording choices must not silently erase a price");
    await page.select('select[aria-label="Component 1 pricing status"]', "confirmed");
    assert.equal(await page.$eval('input[aria-label="Component 2 unit price"]', el => (el as HTMLInputElement).disabled), true);
    await clickLabel(page, "Select Hardware for bulk pricing");
    assert.equal(await page.$eval('thead input[aria-label="Select all items in Major quote components"]', el => (el as HTMLInputElement).indeterminate), true);
    await clickLabel(page, "Select all items in Major quote components");
    assert.match(await page.$eval(".rq-bulk-count", el => el.textContent || ""), /8 selected/);
    assert.match(await page.$eval(".rq-bulk-input-help", el => el.textContent || ""), /gross margin, not markup/);
    await clickLabel(page, "30% margin");
    await clickText(page, ".rq-bulk-toolbar button", "Preview prices");
    await page.waitForSelector("dialog.rq-bulk-dialog[open]");
    assert.match(await page.$eval(".rq-bulk-summary", el => el.textContent || ""), /4 to update \/ 4 skipped/);
    assert.match(await page.$eval(".rq-bulk-preview", el => el.textContent || ""), /selling price is locked/);
    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      assert.equal(await page.$eval("dialog[open]", el => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > innerWidth + 1), false, `Dialog overflow ${width}`);
      await page.screenshot({ path: path.join(output, `margin-review-${width}.png`) });
    }
    await clickText(page, "dialog button", "Cancel");
    assert.equal(await page.$eval('input[aria-label="Component 1 unit price"]', el => (el as HTMLInputElement).value), "120");
    await page.setViewport({ width: 1440, height: 1000 });
    await clickText(page, ".rq-bulk-toolbar button", "Preview prices");
    await clickText(page, "dialog button", "Apply prices");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await page.waitForFunction(() => (document.querySelector('input[aria-label="Component 1 unit price"]') as HTMLInputElement)?.value === "100");
    await page.waitForFunction((key, id) => JSON.parse(localStorage.getItem(key) || "{}").proposals?.find((p: {id:string}) => p.id === id)?.quote.majorProject.options[0].components[0].customerUnitPrice === 100, {}, PROPOSAL_STORE_KEY, quote.internal.quoteId);
    let saved = await savedQuote(page, quote.internal.quoteId!);
    assert.deepEqual(saved.majorProject.options[0].components!.map(row => row.customerUnitPrice), [100, 95, 20, 200, 0, 50, 20, 50]);
    assert.equal(saved.majorProject.options[0].components![7].priceStatus, "confirmed");
    assert.equal(saved.majorProject.options[0].components![7].optional, true);
    assert.equal(saved.majorProject.options[0].components![0].vendorExtendedCost, 140);
    await clickLabel(page, "Select Hardware for bulk pricing");
    await clickLabel(page, "Lock selected prices");
    assert.equal(await page.$eval('input[aria-label="Component 1 unit price"]', el => (el as HTMLInputElement).disabled), true);
    await enter(page, 'input[aria-label="Component 1 quantity"]', "3");
    await page.waitForFunction((key, id) => JSON.parse(localStorage.getItem(key) || "{}").proposals?.find((p: {id:string}) => p.id === id)?.quote.majorProject.options[0].components[0].quantity === 3, {}, PROPOSAL_STORE_KEY, quote.internal.quoteId);
    saved = await savedQuote(page, quote.internal.quoteId!);
    assert.equal(saved.majorProject.options[0].components![0].customerUnitPrice, 100);
    assert.equal(saved.majorProject.options[0].components![0].customerExtendedPrice, 300);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.waitForSelector('input[aria-label="Component 1 unit price"]');
    assert.equal(await page.$eval('input[aria-label="Component 1 unit price"]', el => (el as HTMLInputElement).disabled), true);
    assert.equal(await page.$(".rq-bulk-toolbar"), null, "Selection does not persist across reload");
    await clickLabel(page, "Select Hardware for bulk pricing");
    await clickLabel(page, "Unlock selected prices");
    await clickLabel(page, "Clear selection");
    await clickLabel(page, "Select Hardware for bulk pricing");
    await enter(page, '.rq-bulk-custom input', "96");
    assert.equal(await page.$eval('.rq-bulk-toolbar > button', el => (el as HTMLButtonElement).disabled), true);
    await clickLabel(page, "30% margin");
    await clickText(page, ".rq-bulk-toolbar button", "Preview prices");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await enter(page, 'input[placeholder="Search name, vendor, line type, notes"]', "Monthly");
    assert.equal(await page.$(".rq-bulk-toolbar"), null, "Changing filters clears bulk selection");
    await enter(page, 'input[placeholder="Search name, vendor, line type, notes"]', "");
    assert.equal(await page.$(".rq-bulk-toolbar"), null, "Returning to an old filter must not restore selection");
    await page.select('select[aria-label="Component 6 pricing status"]', "tbd");
    await enter(page, 'input[aria-label="Component 6 unit price"]', "55");
    assert.equal(await page.$eval('select[aria-label="Component 6 pricing status"]', el => (el as HTMLSelectElement).value), "confirmed", "Valid manual pricing clears stale TBD");
    await page.waitForFunction((key, id) => JSON.parse(localStorage.getItem(key) || "{}").proposals?.find((p: {id:string}) => p.id === id)?.quote.majorProject.options[0].components[5].customerUnitPrice === 55, {}, PROPOSAL_STORE_KEY, quote.internal.quoteId);
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      await page.$eval('input[aria-label="Component 1 unit price"]', el => el.scrollIntoView({ block: "center" }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Table overflow ${width}`);
      await page.screenshot({ path: path.join(output, `pricing-table-${width}.png`) });
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL(`/new?proposalId=${simple.internal.quoteId}`, base).href, { waitUntil: "domcontentloaded" });
    // Legacy simple rows migrate into the current component editor on load.
    await page.waitForSelector('input[aria-label="Component 1 unit price"]');
    assert.equal(await page.$eval('input[aria-label="Component 2 unit price"]', el => (el as HTMLInputElement).disabled), true);
    await clickLabel(page, "Select all items in Major quote components");
    await clickText(page, ".rq-bulk-toolbar button", "Preview prices");
    assert.match(await page.$eval(".rq-bulk-summary", el => el.textContent || ""), /1 to update \/ 1 skipped/);
    await clickText(page, "dialog button", "Apply prices");
    await page.waitForFunction(() => (document.querySelector('input[aria-label="Component 1 unit price"]') as HTMLInputElement)?.value === "100");
    assert.equal(await page.$eval('input[aria-label="Component 2 unit price"]', el => (el as HTMLInputElement).value), "95");
    assert.deepEqual(errors, [], "No browser runtime errors");
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, modes: ["advanced", "migrated-simple"], errors }, null, 2));
    console.log(`Bulk pricing checks passed: ${output}`);
  } catch (error) {
    console.error(`Bulk pricing failure details: ${output}`, error);
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => undefined);
    await writeFile(path.join(output, "failure.txt"), `${String(error)}\n${errors.join("\n")}\n${await page.evaluate(() => document.body.innerText)}`);
    await writeFile(path.join(output, "failure-store.json"), await page.evaluate(key => localStorage.getItem(key) || "{}", PROPOSAL_STORE_KEY).catch(() => "{}"));
    throw error;
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

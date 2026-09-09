import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import * as XLSX from "xlsx";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { PROPOSAL_STORE_KEY, ACTIVE_PROPOSAL_ID_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import { createBlankQuoteRecord } from "../app/lib/quote-template";
import { quoteMasterFixtures } from "./quote-master-fixtures";

async function clickText(page: Page, selector: string, text: string) {
  await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some((element) => element.textContent?.trim() === text), { timeout: 20_000 }, selector, text);
  await page.$$eval(selector, (elements, text) => {
    const match = elements.find((element) => element.textContent?.trim() === text) as HTMLElement | undefined;
    if (!match) throw new Error("Missing control: " + text);
    match.click();
  }, text);
}

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve(`tmp/workspace-ui-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  assert.ok(executablePath);
  const session = buildSession({ id: "qa-ui", name: "QA Account Manager", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const selections = quoteMasterFixtures();
  const quotes = selections.map(({ quote }) => applyMajorProjectToQuote(quote));
  quotes[0].metadata.documentTitle = "HydraEDGE with Camera, Wireless Radar Level Sensor, and Staff Gauge with Cellular with Starlink option";
  quotes[2].metadata.documentTitle = "AI and Cloud Solutions";
  const other = createBlankQuoteRecord();
  other.customer.name = "Different Customer";
  other.metadata.documentTitle = "Quick Quote test";
  other.metadata.workflowMode = "quick_quote";
  other.internal.quoteId = "qa-other";
  const store = { currentUser: session.user, users: [session.user], proposals: [...quotes, other].map((quote) => createProposalFromQuote({ quote, owner: session.user, currentUser: session.user })) };
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.evaluateOnNewDocument((state) => {
      if (localStorage.getItem("qa-ui-seeded")) return;
      localStorage.setItem(state.directoryKey, state.directory);
      localStorage.setItem(state.authKey, state.session);
      localStorage.setItem(state.fallbackKey, state.quote);
      localStorage.setItem(state.storeKey, state.store);
      localStorage.setItem(state.activeKey, state.activeId);
      sessionStorage.setItem(state.quoteKey, state.quote);
      localStorage.setItem("qa-ui-seeded", "true");
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...session.user, password: "synthetic-qa-only" }]), authKey: AUTH_STORAGE_KEY, session: JSON.stringify(session), fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY, quote: JSON.stringify(quotes[0]), storeKey: PROPOSAL_STORE_KEY, store: JSON.stringify(store), activeKey: ACTIVE_PROPOSAL_ID_KEY, activeId: quotes[0].internal.quoteId! });
    const cdp = await browser.target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(new URL("/workspace", base).href, { waitUntil: "networkidle0", timeout: 120_000 });
      await page.waitForSelector(".qw-row", { timeout: 60_000 });
      assert.equal(await page.$$eval(".qw-row", (rows) => rows.length), 5);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `Workspace overflow at ${width}`);
      const ai = await page.$$eval(".qw-row", (rows) => rows.find((row) => row.textContent?.includes("AI and Cloud Solutions"))?.textContent || "");
      assert.ok(ai.includes("$10,200.00") && ai.includes("$1,600.00") && !ai.includes("Optional services"));
      await page.screenshot({ path: path.join(output, `workspace-${width}.png`), fullPage: true });
      await page.click('input[aria-label="Select all quotes for QA SARA Workbook"]');
      await page.screenshot({ path: path.join(output, `selection-${width}.png`) });
      await clickText(page, ".qw-selection-bar button", "Export selected quotes");
      await page.waitForSelector("dialog[open]");
      assert.equal(await page.$$eval(".qm-split", (labels) => labels.length), 1);
      assert.match(await page.$eval("dialog[open]", (el) => el.textContent || ""), /Workbook columns \(5\/5\)/);
      const bounds = await page.$eval(".qm-footer", (el) => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
      assert.ok(bounds.top >= 0 && bounds.bottom <= (width < 600 ? 844 : 1000));
      const dialogBounds = await page.$eval("dialog[open]", (el) => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, width: el.clientWidth, content: el.scrollWidth }));
      assert.ok(dialogBounds.left >= 0 && dialogBounds.right <= width && dialogBounds.content <= dialogBounds.width + 1);
      await page.screenshot({ path: path.join(output, `workbook-${width}.png`) });
      if (width === 1440) {
        await clickText(page, ".qm-footer button", "Download Workbook");
        await page.waitForFunction(() => !document.querySelector("dialog[open]") || !!document.querySelector(".qm-error"), { timeout: 60_000 });
        assert.equal(await page.$(".qm-error"), null);
      } else await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      await page.type('input[aria-label="Search quotes"]', "AI and Cloud");
      assert.equal(await page.$$eval(".qw-row", (rows) => rows.length), 1);
      assert.match(await page.$eval(".qw-selection-bar", (el) => el.textContent || ""), /1 quote/);
      await page.click('input[aria-label="Select RCT-1788644603859"]');
      await clickText(page, ".qw-selection-bar button", "Export selected quotes");
      await page.waitForSelector("dialog[open]");
      assert.equal(await page.$$eval(".qm-choice", (rows) => rows.length), 1);
      assert.equal(await page.$(".qm-split"), null);
      await page.keyboard.press("Escape");
      await page.$eval('input[aria-label="Search quotes"]', (el) => { (el as HTMLInputElement).value = ""; });
      // Use keyboard input so the React filter state is updated.
      await page.click('input[aria-label="Search quotes"]');
      await page.keyboard.press("End");
      await page.keyboard.type("nomatch");
      await page.waitForSelector(".qw-empty");
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL("/workspace", base).href, { waitUntil: "networkidle0" });
    await page.click('input[aria-label="Select all quotes for Different Customer"]');
    assert.equal(await page.$eval(".qw-selection-bar .qw-primary", (el) => (el as HTMLButtonElement).disabled), true);
    await clickText(page, ".qw-selection-bar button", "Clear selection");
    const beforeCount = await page.$$eval(".qw-row", (rows) => rows.length);
    await page.click('.qw-row-actions > button');
    await clickText(page, ".qw-action-menu button", "Duplicate quote");
    await page.waitForFunction((n) => document.querySelectorAll(".qw-row").length === n + 1, {}, beforeCount);
    await page.reload({ waitUntil: "networkidle0" });
    assert.equal(await page.$$eval(".qw-row", (rows) => rows.length), beforeCount + 1);
    await page.click(".qw-row-actions > button");
    page.once("dialog", (dialog) => void dialog.dismiss());
    await clickText(page, ".qw-action-menu button", "Delete quote");
    assert.equal(await page.$$eval(".qw-row", (rows) => rows.length), beforeCount + 1);
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(new URL(`/new?proposalId=${quotes[0].internal.quoteId}`, base).href, { waitUntil: "networkidle0", timeout: 120_000 });
      await page.waitForSelector(".rq-editor", { timeout: 60_000 });
      await page.click(".qe-menu > button");
      await page.screenshot({ path: path.join(output, `editor-export-${width}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Editor overflow at ${width}`);
      await clickText(page, ".qe-popover button", "Hector's Quote Master");
      await page.waitForSelector("dialog[open]");
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => document.activeElement?.matches(".qe-menu > button"));
      await page.click("#rq-nav-review");
      await page.screenshot({ path: path.join(output, `review-${width}.png`), fullPage: true });
      const reviewTask = await page.$(".rq-review-tasks button");
      if (reviewTask) {
        await reviewTask.click();
        assert.equal(await page.$eval("#rq-nav-review", (el) => el.getAttribute("aria-current")), null);
      }
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL(`/proposal?proposalId=${quotes[2].internal.quoteId}`, base).href, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.waitForSelector(".proposal-toolbar .qe-menu > button", { timeout: 60_000 });
    await page.click(".proposal-toolbar .qe-menu > button");
    await clickText(page, ".qe-popover button", "Internal Approval Workbook");
    await page.waitForFunction(() => !document.querySelector(".qe-popover:not([hidden])"), { timeout: 60_000 });
    await page.click(".proposal-toolbar .qe-menu > button");
    await clickText(page, ".qe-popover button", "Order-Processing Summary");
    await page.waitForFunction(() => !document.querySelector(".qe-popover:not([hidden])"), { timeout: 60_000 });
    await page.click(".proposal-toolbar .qe-menu > button");
    await clickText(page, ".qe-popover button", "Customer Proposal PDF");
    await page.waitForFunction(() => document.querySelector(".proposal-export-error") || document.querySelector(".proposal-toolbar .qe-menu > button")?.textContent?.trim() === "Export", { timeout: 120_000 });
    assert.equal(await page.$(".proposal-export-error"), null);
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
      await page.screenshot({ path: path.join(output, `preview-${width}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Preview overflow at ${width}`);
    }
    let files: string[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      files = (await readdir(output)).filter((name) => name.endsWith("Quote Master.xlsx"));
      if (files.length) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(files.length, 1);
    const wb = XLSX.read(await readFile(path.join(output, files[0])), { cellFormula: true });
    assert.equal(wb.SheetNames.length, 7);
    // Workspace order is recency-based; validate each named scope, not a fixed column.
    const costs = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Sale (BOM)"], { header: 1 });
    assert.equal(costs.find((row) => row[0] === "Radar hardware package")?.[2], 6000);
    assert.equal(costs.find((row) => row[0] === "Camera hardware package")?.[2], 4400);
    const monthlyByScope = Object.fromEntries(["E", "F", "G", "H", "I"].map((column) => [wb.Sheets.Pricing[`${column}3`].v, wb.Sheets.Pricing[`${column}6`].v]));
    assert.deepEqual(monthlyByScope, { "Radar hardware": 0, "Camera hardware": 0, "AI / cloud": 1600 / 12, "Cellular + SecureLynk": 92.5, "Starlink + SecureLynk": 285.5 });
    const outputs = await readdir(output);
    assert.ok(outputs.some((name) => name.endsWith(".txt")), "Internal order summary downloaded");
    assert.ok(outputs.some((name) => name.endsWith(".xlsx") && !name.endsWith("Quote Master.xlsx")), "Approval workbook downloaded");
    const pdfName = outputs.find((name) => name.endsWith(".pdf"));
    assert.ok(pdfName, "Customer PDF downloaded");
    assert.equal((await readFile(path.join(output, pdfName))).subarray(0, 4).toString(), "%PDF");
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ result: "PASS", output, viewports: [1440, 1024, 768, 390], workbook: files[0] }, null, 2));
    console.log(JSON.stringify({ result: "PASS", output }, null, 2));
  } finally { await browser.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });

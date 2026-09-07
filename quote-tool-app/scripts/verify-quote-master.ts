import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import * as XLSX from "xlsx";
import JSZip from "jszip";
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
    await page.evaluateOnNewDocument((state) => {
      localStorage.setItem(state.directoryKey, state.directory);
      localStorage.setItem(state.authKey, state.session);
      localStorage.setItem(state.fallbackKey, state.quote);
      localStorage.setItem(state.storeKey, state.store);
      localStorage.setItem(state.activeKey, state.activeId);
      sessionStorage.setItem(state.quoteKey, state.quote);
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...session.user, password: "synthetic-qa-only" }]), authKey: AUTH_STORAGE_KEY, session: JSON.stringify(session), fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY, quote: JSON.stringify(quote), storeKey: PROPOSAL_STORE_KEY, store: JSON.stringify(store), activeKey: ACTIVE_PROPOSAL_ID_KEY, activeId: quote.internal.quoteId! });
    const cdp = await browser.target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "networkidle0", timeout: 90_000 });
      await page.waitForSelector(".qe-menu > button", { timeout: 60_000 });
      await page.click(".qe-menu > button");
      await page.$$eval(".qe-popover button", (buttons) => buttons.find((button) => button.textContent?.includes("Hector's Quote Master"))!.click());
      await page.waitForSelector("dialog[open]");
      const text = await page.$eval("dialog[open]", (element) => element.textContent || "");
      for (const expected of ["Workbook columns (5/5)", "Radar hardware", "Camera hardware", "AI / cloud", "$11,944.46", "$9,660.76", "$10,200.00", "$1,600.00", "$92.50", "$285.50"]) assert.ok(text.includes(expected), "Dialog missing " + expected);
      const bounds = await page.$eval("dialog[open]", (element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: element.clientWidth, contentWidth: element.scrollWidth }));
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.contentWidth <= bounds.width + 1, JSON.stringify(bounds));
      await page.screenshot({ path: path.join(output, `dialog-${width}.png`), fullPage: true });
      if (width === 1440) {
        await page.$$eval("dialog[open] button", (buttons) => buttons.find((button) => button.textContent?.includes("Download Workbook"))!.click());
        await page.waitForFunction(() => !document.querySelector("dialog[open]") || Boolean(document.querySelector("dialog[open] [role=alert]")), { timeout: 60_000 });
        const error = await page.$eval("body", (element) => element.querySelector("dialog[open] [role=alert]")?.textContent || "");
        assert.equal(error, "");
      } else await page.keyboard.press("Escape");
    }
    let files: string[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      files = (await readdir(output)).filter((name) => name.endsWith(".xlsx"));
      if (files.length) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(files.length, 1);
    const workbookPath = path.join(output, files[0]);
    const bytes = await readFile(workbookPath);
    const zip = await JSZip.loadAsync(bytes);
    assert.equal(zip.file("xl/calcChain.xml"), null, "The template calculation chain must not survive formula edits");
    assert.ok(!(await zip.file("xl/_rels/workbook.xml.rels")!.async("string")).includes("/calcChain"));
    assert.ok(!(await zip.file("[Content_Types].xml")!.async("string")).includes("/calcChain.xml"));
    const wb = XLSX.read(bytes, { cellStyles: true, cellFormula: true, sheetStubs: true });
    assert.deepEqual(wb.SheetNames, ["Instructions, Assumptions", "Rental (BOM)", "Sale (BOM)", "Pricing", "Cashflow & Payback", "Exec Summary", "NPV - IRR"]);
    assert.equal(wb.Sheets["Sale (BOM)"].C10.v, 6000);
    assert.equal(wb.Sheets.Pricing.H6.v, 92.5);
    assert.equal(wb.Sheets.Pricing.I6.v, 285.5);
    assert.equal(wb.Sheets.Pricing.G6.v, 1600 / 12);
    assert.equal(wb.Sheets["Exec Summary"].D44.f, "'Pricing'!D99");
    assert.equal(wb.Sheets["Exec Summary"].J31.f, "'Pricing'!G56");
    assert.equal(wb.Sheets["Exec Summary"].N40.f, "'Pricing'!I65");
    assert.equal(wb.Sheets["Cashflow & Payback"].C33.f, "-C32");
    assert.equal(wb.Sheets["Exec Summary"].D44.v, 31805.22);
    assert.equal(wb.Sheets["Exec Summary"].F20.v, "Radar hardware");
    assert.equal(wb.Sheets.Pricing.H55.v, 92.5);
    assert.equal(wb.Sheets.Pricing.I55.v, 285.5);
    for (const [name, sheet] of Object.entries(wb.Sheets)) {
      for (const [address, cell] of Object.entries(sheet)) {
        if (!cell.f) continue;
        assert.notEqual(cell.v, undefined, `Missing calculated result: ${name}!${address}`);
        assert.notEqual(cell.t, "e", `Calculation error: ${name}!${address}`);
      }
    }
    assert.deepEqual(errors, []);
    await mkdir(path.resolve("tmp/hector-workbook"), { recursive: true });
    await writeFile(path.resolve("tmp/hector-workbook/latest-qa.json"), JSON.stringify({ workbookPath, output }, null, 2));
    console.log(JSON.stringify({ result: "PASS", workbookPath, viewports: [1440, 390], columns: 5, sheets: 7 }, null, 2));
  } finally { await browser.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });

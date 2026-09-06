import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY, deserializeQuoteRecord, serializeQuoteRecord } from "../app/lib/proposal-state";
import { createBlankQuoteRecord } from "../app/lib/quote-template";
import { getEquipmentTotal, getRecurringMonthlyTotal, getProposalOptionCostSummary } from "../app/lib/proposal-commercial-summary";
import { getAnnualSubscriptionSummary } from "../app/lib/quote-line-billing";

// Synthetic local browser storage only. Never attach to a user's browser profile.
async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve("tmp/quick-quote-conversion-qa");
  await mkdir(output, { recursive: true });
  const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((candidate) => candidate && existsSync(candidate));
  assert.ok(executablePath, "A local Chrome or Edge executable is required");
  const quote = createBlankQuoteRecord();
  Object.assign(quote.metadata, { workflowMode: "quick_quote", proposalNumber: "QA-QUICK-MAJOR", documentTitle: "QA Starlink expansion", accountName: "QA River Operations", status: "draft" });
  Object.assign(quote.internal, { quoteId: "QA-QUICK-MAJOR", savedProposalId: "QA-QUICK-MAJOR" });
  Object.assign(quote.customer, { name: "QA River Operations", contactName: "QA Coordinator", contactPhone: "202-555-0100", contactEmail: "qa@example.test", addressLines: ["100 QA Site Road", "Austin, TX 78701"] });
  quote.billTo = { companyName: quote.customer.name, lines: ["100 QA Site Road"] };
  quote.shipTo = { companyName: quote.customer.name, attention: "QA Receiving", lines: ["200 QA Shipping Road"] };
  quote.shippingSameAsBillTo = false;
  quote.orderProcessing = { ...quote.orderProcessing!, terminals: ["QA-SITE-1", "QA-SITE-2"], shippingContactPhone: "202-555-0101", overageOptIn: "yes", notes: "QA call before dispatch" };
  quote.terms.pricingTerms = ["Hardware is prepaid. Services are invoiced on activation."];
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.termMonths = 12;
  quote.sections.sectionA.poolRows = [
    { id: "qa-data", rowType: "service", description: "QA Starlink shared data", quantity: 1, unitLabel: "pool", monthlyRate: 250, totalMonthlyRate: 250 },
    { id: "qa-taf", rowType: "terminal_fee", description: "QA Terminal access", quantity: 2, monthlyRate: 10, totalMonthlyRate: 20 },
    { id: "qa-overage", rowType: "overage", description: "QA Additional usage", quantity: null, unitLabel: "GB", monthlyRate: 0.75, totalMonthlyRate: 0.75 },
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    { id: "qa-kit", sourceType: "custom", itemName: "QA Starlink kit", quantity: 2, unitPrice: 600, totalPrice: 1200, partNumber: "QA-KIT", description: "QA mounting kit included" },
    { id: "qa-cloud", sourceType: "custom", itemName: "QA Annual cloud storage", quantity: 2, unitPrice: 125, totalPrice: 250, billing: { cadence: "annual", startsYear: 1, unitLabel: "camera" } },
    { id: "qa-option", sourceType: "custom", itemName: "QA Spare router", quantity: 1, unitPrice: 100, totalPrice: 100, optional: true },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [{ id: "qa-install", sourceType: "custom", description: "QA Installation", quantity: 2, unitPrice: 200, totalPrice: 400, pricingStage: "final" }];
  quote.commercial.costs.oneTimeEquipmentCost = 700;
  const session = buildSession({ id: "qa-conversion", name: "QA Conversion", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.evaluateOnNewDocument((state) => {
      if (sessionStorage.getItem("qa-conversion-seeded")) return;
      localStorage.setItem(state.directoryKey, state.directory);
      localStorage.setItem(state.authKey, state.session);
      localStorage.setItem(state.fallbackKey, state.quote);
      sessionStorage.setItem(state.quoteKey, state.quote);
      sessionStorage.setItem("qa-conversion-seeded", "true");
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...session.user, password: "synthetic-qa-only" }]), authKey: AUTH_STORAGE_KEY, session: JSON.stringify(session), fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY, quote: serializeQuoteRecord(quote) });
    await page.goto(new URL("/new", base).href, { waitUntil: "networkidle0", timeout: 90_000 });
    console.log("Loaded", page.url());
    await page.screenshot({ path: path.join(output, "initial.png"), fullPage: false });
    await page.waitForSelector('[aria-label="Hardware 1 name"]', { timeout: 30_000 });
    const clickButton = async (label: string) => {
      await page.$$eval("button", (buttons, text) => {
        const button = buttons.find((candidate) => candidate.textContent?.trim() === text);
        if (!button || button.disabled) throw new Error("Button unavailable: " + text);
        button.click();
      }, label);
    };
    await clickButton("Major Quote");
    await page.waitForSelector('[aria-label="Component 1 name"]');
    assert.equal(await page.$eval('[aria-label="Component 1 name"]', (input) => (input as HTMLInputElement).value), "QA Starlink shared data");
    assert.ok(await page.$eval("body", (body) => body.textContent?.includes("Usage-based")));
    await clickButton("Save");
    await page.waitForFunction((key) => JSON.parse(sessionStorage.getItem(key) || "{}").metadata?.workflowMode === "major_project", {}, PROPOSAL_STORAGE_KEY);
    const readQuote = async () => deserializeQuoteRecord(await page.evaluate((key) => sessionStorage.getItem(key), PROPOSAL_STORAGE_KEY))!;
    let saved = await readQuote();
    assert.equal(getRecurringMonthlyTotal(saved), 270);
    assert.equal(getEquipmentTotal(saved), 1200);
    assert.equal(getAnnualSubscriptionSummary(saved).firstYearTotal, 250);
    assert.equal(getProposalOptionCostSummary(saved).oneTimeTotal, 100);
    assert.deepEqual(saved.shipTo, quote.shipTo);
    assert.deepEqual(saved.orderProcessing, deserializeQuoteRecord(serializeQuoteRecord(quote))!.orderProcessing);
    assert.equal(saved.sections.sectionC.lineItems[0].pricingStage, "final");
    await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: false });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('[aria-label="Component 1 name"]');
    await clickButton("Quick Quote");
    await page.waitForSelector('[aria-label="Hardware 1 name"]');
    await clickButton("Major Quote");
    await page.waitForSelector('[aria-label="Component 1 name"]');
    await clickButton("Save");
    saved = await readQuote();
    assert.equal(saved.majorProject.options.length, 1);
    assert.equal(getRecurringMonthlyTotal(saved), 270);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.waitForSelector('[aria-label="Component 1 name"]');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, "mobile.png"), fullPage: false });
    const modeBounds = await page.$eval(".rq-mode-group", (element) => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, width: window.innerWidth }));
    assert.ok(modeBounds.left >= 0 && modeBounds.right <= modeBounds.width, "Mode controls must fit on mobile");
    await page.setViewport({ width: 1440, height: 1000 });
    await page.waitForSelector('[aria-label="Component 1 name"]');
    await clickButton("Preview");
    await page.waitForSelector(".customer-proposal", { timeout: 30_000 });
    const previewText = await page.$eval(".customer-proposal", (element) => element.textContent || "");
    assert.ok(previewText.includes("QA Starlink shared data"));
    assert.ok(previewText.includes("QA Starlink kit"));
    assert.ok(previewText.includes("QA Annual cloud storage"));
    assert.ok(!previewText.includes("Quick Quote hardware cost"));
    const response = await fetch(new URL("/api/proposal-pdf", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: saved, proposalId: "QA-QUICK-MAJOR" }), signal: AbortSignal.timeout(180_000) });
    assert.equal(response.status, 200, "Converted quote PDF export");
    const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), useSystemFonts: true }).promise;
    let text = "";
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const content = await (await pdf.getPage(index)).getTextContent();
      text += content.items.map((item) => "str" in item ? item.str : "").join(" ");
    }
    const pages = pdf.numPages;
    await pdf.destroy();
    for (const label of ["QA Starlink shared data", "QA Terminal access", "QA Additional usage", "QA Starlink kit", "QA Annual cloud storage", "QA Spare router", "QA Installation"]) assert.ok(text.includes(label), "PDF missing " + label);
    for (const amount of ["$270.00", "$1,200.00", "$250.00", "$0.75"]) assert.ok(text.includes(amount), "PDF missing " + amount);
    assert.doesNotMatch(text, /Quick Quote hardware cost|\$700\.00|hardware margin/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "PASS", workflow: "Quick Quote -> Major Quote -> save -> reload -> switch back and forth -> preview -> PDF", monthly: 270, equipment: 1200, annual: 250, optional: 100, pdfPages: pages, screenshots: output }, null, 2));
  } catch (error) {
    const page = (await browser.pages()).at(-1);
    if (page) {
      await page.screenshot({ path: path.join(output, "failure.png"), fullPage: false });
      console.error(await page.$eval("body", (body) => body.innerText.slice(0, 2500)));
    }
    throw error;
  } finally { await browser.close(); }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });

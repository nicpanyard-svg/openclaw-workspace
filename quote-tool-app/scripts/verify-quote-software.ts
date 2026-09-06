import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { createBlankQuoteRecord } from "../app/lib/quote-template";
import { IOTEDGE_KINNECT_LABEL } from "../app/lib/quote-software";
import { AXIS_LOCAL_STORAGE_LABEL } from "../app/lib/quote-item-wording";

// Isolated, synthetic local session. Exercise legacy data without pre-normalizing it.
async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve("tmp/quote-software-qa");
  await mkdir(output, { recursive: true });
  const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((candidate) => candidate && existsSync(candidate));
  assert.ok(executablePath);
  const quote = createBlankQuoteRecord();
  Object.assign(quote.metadata, { proposalNumber: "QA-SOFTWARE", documentTitle: "QA HydraEDGE software classification", status: "draft" });
  Object.assign(quote.internal, { quoteId: "QA-SOFTWARE", savedProposalId: "QA-SOFTWARE" });
  quote.customer.name = "QA River Operations";
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    { id: "gateway", sourceType: "custom", itemName: "Cellular Modem and LoRaWAN Gateway - RAD Secflow-1p", quantity: 1, unitPrice: 1525.70, totalPrice: 1525.70 },
    { id: "storage", sourceType: "custom", itemName: "1 TB SD Memory Card", description: "IP 67 enclosure with poll mount", quantity: 1, unitPrice: 125, totalPrice: 125 },
  ];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    { id: "software", sourceType: "custom", description: "LoRaWAN EDGE Software: IoTEDGE Kinnect from RAD", quantity: 1, unitPrice: 408, totalPrice: 408, unitLabel: "ea", pricingStage: "budgetary" },
    { id: "install", sourceType: "custom", description: "Installation", quantity: 1, unitPrice: 3000, totalPrice: 3000, unitLabel: "ea", pricingStage: "budgetary", notes: "Budget Estimate ~300 miles of drive time and 8 hours of labor" },
  ];
  const session = buildSession({ id: "qa-software", name: "QA Software", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.evaluateOnNewDocument((state) => {
      localStorage.setItem(state.directoryKey, state.directory);
      localStorage.setItem(state.authKey, state.session);
      localStorage.setItem(state.fallbackKey, state.quote);
      sessionStorage.setItem(state.quoteKey, state.quote);
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...session.user, password: "synthetic-qa-only" }]), authKey: AUTH_STORAGE_KEY, session: JSON.stringify(session), fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY, quote: JSON.stringify(quote) });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewport(viewport);
      await page.goto(new URL("/proposal", base).href, { waitUntil: "networkidle0", timeout: 90_000 });
      await page.waitForSelector(".customer-proposal");
      const text = await page.$eval(".customer-proposal", (element) => element.textContent || "");
      assert.ok(text.includes(IOTEDGE_KINNECT_LABEL));
      assert.ok(text.includes("Software & implementation services"));
      assert.ok(text.includes("One software instance/license per configured gateway, as quoted."));
      assert.ok(text.includes("$408.00"));
      assert.ok(text.includes("$3,408.00"));
      assert.ok(text.includes("$5,058.70"));
      for (const label of [AXIS_LOCAL_STORAGE_LABEL, "RAD SecFlow-1p", "IP67 enclosure with pole mount"]) assert.ok(text.includes(label), "Preview missing " + label);
      assert.doesNotMatch(text, /IP 67|RAD Secflow-1p|poll mount|1 TB SD Memory Card/);
      assert.ok(!text.includes("LoRaWAN EDGE Software: IoTEDGE Kinnect from RAD"));
      const rows = await page.$$eval(".cp-table tbody tr", (elements) => elements.map((row) => ({ text: row.textContent || "", notes: Array.from(row.querySelectorAll(".cp-row-note")).map((element) => element.textContent) })));
      assert.ok(rows.find((row) => row.text.includes("IoTEDGE Kinnect"))?.notes.includes("Software license"));
      assert.ok(rows.find((row) => row.text.startsWith("Installation"))?.notes.includes("Estimated"));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: path.join(output, `${viewport.width === 390 ? "mobile" : "desktop"}.png`), fullPage: true });
      const bounds = await page.$eval(".customer-proposal", (element) => ({ width: element.clientWidth, contentWidth: element.scrollWidth }));
      assert.ok(bounds.contentWidth <= bounds.width + 1, "Proposal content must fit its container");
      if (viewport.width === 390) {
        const canReachPrice = await page.evaluate(() => {
          const section = Array.from(document.querySelectorAll<HTMLElement>(".cp-section")).find((element) => element.querySelector("h2")?.textContent === "Software & implementation services")!;
          section.scrollLeft = section.scrollWidth;
          const price = section.querySelector("tbody tr td:last-child")!.getBoundingClientRect();
          return section.scrollLeft > 0 && price.right <= section.getBoundingClientRect().right + 1;
        });
        assert.ok(canReachPrice, "Mobile table must scroll to its prices");
      }
    }
    // The server receives an unnormalized old quote, matching cached print requests.
    const response = await fetch(new URL("/api/proposal-pdf", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote, proposalId: "QA-SOFTWARE" }), signal: AbortSignal.timeout(180_000) });
    assert.equal(response.status, 200);
    const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), useSystemFonts: true }).promise;
    let pdfText = "";
    for (let index = 1; index <= pdf.numPages; index += 1) {
      const pdfPage = await pdf.getPage(index);
      const text = (await pdfPage.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ");
      pdfText += text;
      if (text.includes("IoTEDGE Kinnect")) {
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await pdfPage.render({ canvas: canvas as never, canvasContext: canvas.getContext("2d") as never, viewport }).promise;
        await writeFile(path.join(output, `pdf-page-${index}.png`), canvas.toBuffer("image/png"));
      }
    }
    for (const expected of [IOTEDGE_KINNECT_LABEL, AXIS_LOCAL_STORAGE_LABEL, "RAD SecFlow-1p", "IP67 enclosure with pole mount", "Software license", "$408.00", "$125.00", "$3,408.00", "$5,058.70", "One software instance/license per configured gateway, as quoted."]) assert.ok(pdfText.includes(expected), "PDF missing " + expected);
    assert.doesNotMatch(pdfText, /IP 67|RAD Secflow-1p|poll mount|1 TB SD Memory Card/);
    assert.ok(!pdfText.includes("LoRaWAN EDGE Software: IoTEDGE Kinnect from RAD"));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: "PASS", pdfPages: pdf.numPages, software: 408, storage: 125, installation: 3000, total: 5058.70, screenshots: output }, null, 2));
    await pdf.destroy();
  } finally { await browser.close(); }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });

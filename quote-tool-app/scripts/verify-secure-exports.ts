import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import { finalReviewKey } from "../app/lib/final-quote-review";
import { missingProcessingRequirements } from "../app/lib/processing-requirements";
import { fixtureComponent, fixtureQuote } from "./quote-master-fixtures";
import { prepareProFormaFixture } from "./pro-forma-fixtures";

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  const live = process.env.RAPIDQUOTE_LIVE_QA === "1" && base.origin === "https://quote-tool-app.vercel.app";
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) || live);
  const output = path.resolve(`tmp/secure-export-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const spec = await PDFDocument.create();
  spec.addPage([500, 300]).drawText("QA SPECIFICATION ATTACHMENT", { x: 30, y: 200, size: 18 });
  const specBytes = await spec.save();
  const attachment = { storageKey: "qa-security-spec", fileName: "QA-specification.pdf", mimeType: "application/pdf", sizeBytes: specBytes.length, updatedAt: new Date().toISOString() };
  let quote = prepareProFormaFixture(fixtureQuote("QA-SECURE-EXPORT", "Security Export Check", [
    fixtureComponent("Test gateway", 500, 200, { specSheetAttachment: attachment }),
    fixtureComponent("Test data service", 50, 20, { lineType: "subscription", schedule: "recurring" }),
  ]));
  quote.internal.internalNotes = "INTERNAL-QA-DO-NOT-PRINT";
  quote = applyMajorProjectToQuote(quote);
  quote.orderProcessing!.requirements!.equipment = Object.fromEntries(quote.sections.sectionB.lineItems.map(row => [row.id, { kind: "standalone", assemblyDetails: "" }]));
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  assert.deepEqual(missingProcessingRequirements(quote), []);
  const session = buildSession({ id: "qa-security", name: "QA User", email: "qa@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false });
  const proposal = createProposalFromQuote({ quote, owner: session.user, currentUser: session.user });
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  const securityErrors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error" && /Content Security Policy|Refused to/i.test(message.text())) securityErrors.push(message.text()); });
  page.on("dialog", dialog => void dialog.accept());
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL("/login", base).href, { waitUntil: "domcontentloaded" });
    await page.evaluate(async seed => {
      localStorage.setItem(seed.authKey, JSON.stringify(seed.session));
      localStorage.setItem(seed.directoryKey, JSON.stringify([{ ...seed.session.user, password: "synthetic-qa-only" }]));
      localStorage.setItem(seed.storeKey, JSON.stringify({ currentUser: seed.session.user, users: [seed.session.user], proposals: [seed.proposal] }));
      localStorage.setItem(seed.activeKey, seed.proposal.id);
      localStorage.setItem(seed.fallbackKey, JSON.stringify(seed.quote));
      sessionStorage.setItem(seed.quoteKey, JSON.stringify(seed.quote));
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("rapidquote-major-project-specs", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("attachments", { keyPath: "storageKey" });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("attachments", "readwrite");
          tx.objectStore("attachments").put({ ...seed.attachment, fileBlob: new Blob([new Uint8Array(seed.specBytes)], { type: "application/pdf" }) });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
      });
    }, { session, proposal, quote, attachment, specBytes: [...specBytes], authKey: AUTH_STORAGE_KEY, directoryKey: USER_DIRECTORY_STORAGE_KEY, storeKey: PROPOSAL_STORE_KEY, activeKey: ACTIVE_PROPOSAL_ID_KEY, fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY });
    const cdp = await page.createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
    await page.goto(new URL("/proposal", base).href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cp-spec-page img", { timeout: 60_000 });
    await page.$eval(".cp-spec-page img", element => element.scrollIntoView());
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(".cp-spec-page img");
      return image?.complete && image.naturalWidth > 0;
    }, { timeout: 60_000 });
    await page.$eval(".cp-attachment-preview", element => element.scrollIntoView());
    await page.screenshot({ path: path.join(output, "spec-preview.png") });
    await page.$eval(".qe-menu > button", element => (element as HTMLButtonElement).click());
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/proposal-pdf"), { timeout: 120_000 });
    await page.$$eval(".qe-popover button", buttons => {
      const download = buttons.find(button => button.textContent?.trim() === "Customer Proposal PDF") as HTMLButtonElement | undefined;
      if (!download) throw new Error("Missing proposal export control");
      download.click();
    });
    const response = await responsePromise;
    assert.equal(response.status(), 200, response.status() === 200 ? "Proposal PDF" : await response.text());
    let file: string | undefined;
    for (let attempt = 0; attempt < 240; attempt++) {
      file = (await readdir(output)).find(name => name.endsWith(".pdf"));
      if (file) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(file, "Completed proposal PDF download");
    const bytes = await readFile(path.join(output, file));
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const pdf = await task.promise;
    let text = "";
    try {
      for (let index = 1; index <= pdf.numPages; index++) {
        const content = await (await pdf.getPage(index)).getTextContent();
        text += content.items.map(item => "str" in item ? item.str : "").join(" ") + "\n";
      }
    } finally { await task.destroy(); }
    assert.match(text, /Test gateway/);
    assert.match(text, /QA SPECIFICATION ATTACHMENT/);
    assert.doesNotMatch(text, /INTERNAL-QA-DO-NOT-PRINT|QA vendor|Target.*margin/i);
    assert.deepEqual(errors, []);
    assert.deepEqual(securityErrors, []);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, origin: base.origin, pdf: file, attachmentRendered: true, attachmentExported: true, errors, securityErrors }, null, 2));
    console.log(`Secure export checks passed: ${output}`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => undefined);
    await writeFile(path.join(output, "failure.json"), JSON.stringify({ error: String(error), errors, securityErrors, text: await page.evaluate(() => document.body.innerText).catch(() => "") }, null, 2));
    throw error;
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

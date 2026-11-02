import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession, type AuthUser } from "../app/lib/auth";
import { PROPOSAL_STORE_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { buildProFormaFileName, buildProFormaInvoice } from "../app/lib/pro-forma";
import { finalReviewKey } from "../app/lib/final-quote-review";
import { proFormaFixture } from "./pro-forma-fixtures";

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017");
  const authorizedLiveCheck = process.env.RAPIDQUOTE_LIVE_QA === "1" && base.origin === "https://quote-tool-app.vercel.app";
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname) || authorizedLiveCheck);
  const output = path.resolve(`tmp/pro-forma-qa-${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  assert.ok(executablePath);
  const user: AuthUser = { id: "qa-pro-forma", name: "QA Account Manager", email: "qa@example.test", role: "sales", title: "QA", team: "QA", status: "active", initials: "QA", canManageUsers: false };
  const quote = proFormaFixture();
  quote.proForma = undefined;
  const proposal = createProposalFromQuote({ quote, owner: user, currentUser: user });
  // Isolated fixtures only. The user's browser and saved quotes are never modified.
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    let failInvoicePdf = false;
    let attemptedEmails = 0;
    await page.setRequestInterception(true);
    page.on("request", request => {
      if (new URL(request.url()).hostname === "graph.microsoft.com") { attemptedEmails++; void request.abort(); return; }
      if (failInvoicePdf && request.url().endsWith("/api/pro-forma-pdf")) {
        void request.respond({ status: 422, contentType: "application/json", body: JSON.stringify({ missingFields: ["Confirm the quote details before attaching the PDF."] }) });
        return;
      }
      void request.continue();
    });
    const downloads = await browser.target().createCDPSession();
    await downloads.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.evaluateOnNewDocument(seed => {
      if (localStorage.getItem("qa-pro-forma-seeded")) return;
      localStorage.setItem(seed.authKey, seed.auth);
      localStorage.setItem(seed.directoryKey, seed.directory);
      localStorage.setItem(seed.storeKey, seed.store);
      localStorage.setItem("qa-pro-forma-seeded", "true");
    }, { authKey: AUTH_STORAGE_KEY, auth: JSON.stringify(buildSession(user)), directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...user, password: "synthetic-test-only" }]), storeKey: PROPOSAL_STORE_KEY, store: JSON.stringify({ currentUser: user, users: [user], proposals: [proposal] }) });
    await page.setViewport({ width: 1440, height: 1050 });
    await page.goto(new URL(`/new?proposalId=${proposal.id}`, base).href, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.waitForSelector("#rq-nav-invoice", { timeout: 60_000 });
    await page.click("#rq-nav-invoice");
    await page.waitForSelector(".pf-preview");
    await page.waitForFunction(() => document.querySelector<HTMLIFrameElement>(".pf-preview")?.contentDocument?.querySelector(".total")?.textContent?.includes("2,692.25"));
    await page.type(".pf-fields label:nth-child(3) input", "PO-2401");
    await page.type(".pf-notes textarea", "Deliver to the receiving dock.");
    await page.$$eval(".rq-editor-actions button", buttons => (buttons.find(button => button.textContent?.trim() === "Save draft") as HTMLButtonElement).click());
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#rq-nav-invoice");
    await page.click("#rq-nav-invoice");
    await page.waitForSelector(".pf-preview");
    assert.equal(await page.$eval(".pf-fields label:nth-child(3) input", el => (el as HTMLInputElement).value), "PO-2401");
    assert.equal(await page.$eval(".pf-notes textarea", el => (el as HTMLTextAreaElement).value), "Deliver to the receiving dock.");
    for (const width of [1440, 1024, 785, 390, 320]) {
      await page.setViewport({ width, height: 1050 });
      await page.waitForFunction(() => {
        const doc = document.querySelector<HTMLIFrameElement>(".pf-preview")?.contentDocument;
        return doc?.querySelector(".total")?.textContent?.includes("2,692.25") && [...doc.images].every(image => image.complete && image.naturalWidth > 0);
      });
      const overflow = await page.evaluate(() => {
        const frame = document.querySelector<HTMLIFrameElement>(".pf-preview")!;
        return { page: document.documentElement.scrollWidth > innerWidth + 1, invoice: frame.contentDocument!.documentElement.scrollWidth > frame.clientWidth + 1, totalsVisible: getComputedStyle(document.querySelector(".rq-totals")!).display !== "none" };
      });
      assert.deepEqual(overflow, { page: false, invoice: false, totalsVisible: false }, `Responsive invoice at ${width}`);
      await page.screenshot({ path: path.join(output, `invoice-${width}.png`) });
    }
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 1050 });
      await page.$eval(".pf-preview", element => {
        const frame = element as HTMLIFrameElement;
        frame.scrollIntoView({ block: "start" });
        frame.contentWindow!.scrollTo(0, frame.contentDocument!.documentElement.scrollHeight);
      });
      const signoff = await page.$eval(".pf-preview", element => {
        const doc = (element as HTMLIFrameElement).contentDocument!;
        return [...doc.querySelectorAll(".signoff-row")].map(row => row.querySelector("strong")?.textContent);
      });
      assert.deepEqual(signoff, ["Sales", "Accounting"]);
      await page.screenshot({ path: path.join(output, `signoff-${width}.png`) });
    }
    await page.setViewport({ width: 1440, height: 1050 });
    const responsePromise = page.waitForResponse(response => response.url().endsWith("/api/pro-forma-pdf"), { timeout: 120_000 });
    await page.click(".pf-panel .rq-button-primary");
    const response = await responsePromise;
    assert.equal(response.status(), 200, response.status() === 200 ? "Invoice PDF request" : await response.text());
    const file = path.join(output, buildProFormaFileName(quote));
    for (let attempt = 0; attempt < 100 && !existsSync(file); attempt++) await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok(existsSync(file), "Browser downloads the invoice PDF");
    const bytes = await readFile(file);
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    const inspectPdf = async (data: Uint8Array, name: string, expectedTotal: string) => {
      const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
      let text = "";
      let signoffPages = 0;
      for (let index = 1; index <= pdf.numPages; index++) {
        const pdfPage = await pdf.getPage(index);
        const content = await pdfPage.getTextContent();
        const pageText = content.items.filter(item => "str" in item).map(item => item.str).join(" ");
        assert.match(pageText, /Pro Forma Invoice \| Page/);
        // Linux PDF fonts can emit the "ff" ligature as a separate text span.
        const joinedText = content.items.filter(item => "str" in item).map(item => item.str).join("").normalize("NFKC");
        if (joinedText.includes("Internal sign-off")) {
          signoffPages++;
          assert.match(pageText, /Sales/);
          assert.match(pageText, /Accounting/);
          assert.match(pageText, /PRO FORMA ONLY/, "The invoice disclaimer stays with the sign-off lines");
          assert.equal(pageText.match(/Name \/ signature/g)?.length, 2, "Both signature lines stay together on one page");
        }
        text += pageText + "\n";
        const viewport = pdfPage.getViewport({ scale: 1.4 });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await pdfPage.render({ canvas: canvas as never, canvasContext: canvas.getContext("2d") as never, viewport }).promise;
        await writeFile(path.join(output, `${name}-${index}.png`), canvas.toBuffer("image/png"));
      }
      assert.ok(text.includes(expectedTotal));
      assert.equal(signoffPages, 1, "Invoice includes one internal sign-off section");
      assert.match(text, /PRO FORMA ONLY/);
      assert.doesNotMatch(text, /INTERNAL_COST_SECRET|vendor cost|gross profit|target margin/i);
      await pdf.destroy();
      return text;
    };
    const purchaseText = await inspectPdf(bytes, "purchase-pdf", "$2,692.25");
    assert.match(purchaseText, /PO-2401/);
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).proposals[0].quote, PROPOSAL_STORE_KEY);
    assert.equal(buildProFormaInvoice(saved).total, 2692.25);
    assert.equal(saved.proForma.customerPo, "PO-2401");
    assert.ok(saved.proForma.issueDate);

    failInvoicePdf = true;
    await page.click(".pf-actions button:first-child");
    await page.waitForSelector(".pf-email-dialog[open]");
    await page.waitForFunction(() => document.querySelector(".pf-email-error")?.textContent?.includes("Confirm the quote details"));
    assert.equal(await page.$eval(".pf-email-footer button[type=submit]", element => (element as HTMLButtonElement).disabled), true);
    failInvoicePdf = false;
    await page.click(".pf-email-error button");
    await page.waitForFunction(() => document.querySelector(".pf-email-attachment")?.textContent?.includes("PDF attached"), { timeout: 120_000 });
    assert.match(await page.$eval(".pf-email-addresses", element => element.textContent || ""), /Ruthie Ramay[\s\S]*Inside Sales[\s\S]*ruthie\.ramay@inetlte\.com/);
    assert.match(await page.$eval(".pf-email-field textarea", element => (element as HTMLTextAreaElement).value), /Sales and Accounting sign-off/);
    assert.match(await page.$eval(".pf-email-warning", element => element.textContent || ""), /not configured yet/);
    for (const width of [1440, 785, 390, 320]) {
      await page.setViewport({ width, height: 1050 });
      const layout = await page.$eval(".pf-email-dialog", element => {
        const rect = element.getBoundingClientRect();
        const footer = element.querySelector(".pf-email-footer")!.getBoundingClientRect();
        return { overflow: element.scrollWidth > element.clientWidth + 1, left: rect.left, right: rect.right, footerBottom: footer.bottom };
      });
      assert.equal(layout.overflow, false);
      assert.ok(layout.left >= 0 && layout.right <= width + 1 && layout.footerBottom <= 1050);
      await page.screenshot({ path: path.join(output, `email-${width}.png`) });
    }
    await page.keyboard.press("Escape");
    await page.waitForSelector(".pf-email-dialog", { hidden: true });
    assert.equal(attemptedEmails, 0, "Preview and PDF preparation never send mail");
    const callback = await browser.newPage();
    await callback.goto(new URL("/outlook-callback", base).href, { waitUntil: "networkidle0" });
    assert.equal(new URL(callback.url()).pathname, "/outlook-callback", "Microsoft callback is not redirected to application login");
    assert.equal(await callback.$("nav"), null, "Microsoft callback has no app navigation");
    await callback.close();

    const lease = proFormaFixture();
    Object.assign(lease.metadata, { quoteType: "lease", hasActiveDataAgreement: true, leaseTermMonths: 3, leaseMarginPercent: 25 });
    lease.commercial.costs.oneTimeEquipmentCost = 600;
    lease.customerOutput!.commercialConfirmation = finalReviewKey(lease);
    const leaseResponse = await fetch(new URL("/api/pro-forma-pdf", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: lease }) });
    assert.equal(leaseResponse.status, 200);
    const leaseBytes = new Uint8Array(await leaseResponse.arrayBuffer());
    await writeFile(path.join(output, "lease.pdf"), leaseBytes);
    const leaseText = await inspectPdf(leaseBytes, "lease-pdf", "$1,958.92");
    assert.match(leaseText, /Equipment is leased, not charged as an upfront purchase/);
    assert.doesNotMatch(leaseText, /\$1,000\.00|\$600\.00/);

    const long = proFormaFixture();
    for (let index = 1; index <= 35; index++) long.sections.sectionC.lineItems.push({ id: `long-${index}`, sourceType: "custom", description: `Field work ${index}: configuration and commissioning for the remote monitoring station`, quantity: 1, unitPrice: 10, totalPrice: 10 });
    const longResponse = await fetch(new URL("/api/pro-forma-pdf", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: long }) });
    assert.equal(longResponse.status, 200);
    const longBytes = new Uint8Array(await longResponse.arrayBuffer());
    await writeFile(path.join(output, "multipage.pdf"), longBytes);
    const longText = await inspectPdf(longBytes, "multipage-pdf", "$3,042.25");
    for (let index = 1; index <= 35; index++) assert.ok(longText.includes(`Field work ${index}:`));

    lease.proForma!.issueDate = "2026-02-30";
    const invalidDate = await fetch(new URL("/api/pro-forma-pdf", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: lease }) });
    assert.equal(invalidDate.status, 422);
    const invalidBody = await fetch(new URL("/api/pro-forma-pdf", base), { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
    assert.equal(invalidBody.status, 400);
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, output, viewports: [1440, 1024, 785, 390, 320], purchaseTotal: 2692.25, leaseTotal: 1958.92, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, output }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

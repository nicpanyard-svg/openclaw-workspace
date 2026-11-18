import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import puppeteer, { type ElementHandle, type Page, type ScreenRecorder } from "puppeteer-core";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession } from "../app/lib/auth";
import { PROPOSAL_STORAGE_KEY, PROPOSAL_STORAGE_FALLBACK_KEY } from "../app/lib/proposal-state";
import { PROPOSAL_STORE_KEY, ACTIVE_PROPOSAL_ID_KEY, createProposalFromQuote } from "../app/lib/proposal-store";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import { finalReviewKey } from "../app/lib/final-quote-review";
import { missingProcessingRequirements } from "../app/lib/processing-requirements";
import { fixtureComponent, fixtureQuote } from "./quote-master-fixtures";
import { prepareProFormaFixture } from "./pro-forma-fixtures";

const dryRun = process.argv.includes("--dry-run");
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, dryRun ? Math.min(ms, 120) : ms));

async function clickText(page: Page, selector: string, text: string) {
  await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some(el => (el as HTMLElement).offsetParent !== null && el.textContent?.trim() === text), {}, selector, text);
  const element = await page.evaluateHandle((selector, text) => [...document.querySelectorAll(selector)].find(el => (el as HTMLElement).offsetParent !== null && el.textContent?.trim() === text), selector, text);
  const target = element.asElement() as ElementHandle<Element> | null;
  assert.ok(target);
  await target.scrollIntoView();
  await delay(300);
  await target.click();
  await element.dispose();
}

async function focusItem(page: Page, selector: string, offset = 270) {
  await page.$eval(selector, (el, offset) => {
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, offset);
  await delay(800);
}

function assTime(seconds: number) {
  const n = Math.round(seconds * 100);
  return `${Math.floor(n / 360000)}:${String(Math.floor(n / 6000) % 60).padStart(2, "0")}:${String(Math.floor(n / 100) % 60).padStart(2, "0")}.${String(n % 100).padStart(2, "0")}`;
}

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3018");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Demo capture is local only.");
  const output = path.resolve("tmp/rapidquote-showcase", dryRun ? "rehearsal" : "final");
  const docs = path.join(output, "sample-documents");
  await mkdir(docs, { recursive: true });
  const ffmpeg = process.env.FFMPEG_PATH || path.resolve("tmp/video-tools/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v9.0.2.exe");
  assert.ok(existsSync(ffmpeg));
  const executablePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const session = buildSession({ id: "demo-presenter", name: "RapidQuote Demo", email: "demo@example.test", title: "Sales", team: "Demo", role: "sales", status: "active", initials: "RQ", canManageUsers: false });
  let quote = prepareProFormaFixture(fixtureQuote("DEMO-1042", "Remote Site Connectivity", [
    fixtureComponent("Industrial connectivity gateway", 800, 525, { quantity: 1, vendor: "Example Supplier" }),
    fixtureComponent("Site installation", 500, 315, { lineType: "installation", vendor: "Example Services" }),
    fixtureComponent("Data and monitoring", 95, 59.5, { lineType: "subscription", schedule: "recurring", vendor: "Example Network" }),
    fixtureComponent("Extended support plan", 240, 168, { lineType: "subscription", schedule: "recurring", billing: { cadence: "annual" }, optional: true, vendor: "Example Services" }),
    fixtureComponent("Remote configuration", 0, 35, { priceStatus: "included", lineType: "installation", vendor: "Example Services" }),
  ]));
  Object.assign(quote.customer, { name: "Asterfield Utilities (Demo)", contactName: "Alex Morgan", contactEmail: "alex@example.test", contactPhone: "512-555-0142", addressLines: ["100 Example Way", "Austin, TX 78701"] });
  quote.billTo = { companyName: quote.customer.name, attention: "Accounts Payable", lines: [...quote.customer.addressLines] };
  quote.inet.contactName = "RapidQuote Demo";
  quote.inet.contactEmail = "demo@example.test";
  quote.inet.contactPhone = "512-555-0100";
  Object.assign(quote.metadata, { ownerName: session.user.name, ownerUserId: session.user.id, proposalDate: "2026-11-18", expirationDate: "2026-12-18", salesTaxAmount: 0 });
  quote.majorProject.summary.projectDescription = "Connectivity, installation, and monitoring for a remote utility site.";
  quote.orderProcessing!.notes = "Demonstration only. All customer details and prices are fictional.";
  quote.orderProcessing!.requirements!.corporatePricingReference = "Sample pricing";
  quote = applyMajorProjectToQuote(quote);
  quote.orderProcessing!.requirements!.equipment = Object.fromEntries(quote.sections.sectionB.lineItems.map(row => [row.id, { kind: "standalone", assemblyDetails: "" }]));
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  quote.proForma!.issueDate = "2026-11-18";
  quote.proForma!.notes = "Demonstration only. Not an actual invoice.";
  assert.deepEqual(missingProcessingRequirements(quote), []);
  const store = { currentUser: session.user, users: [session.user], proposals: [createProposalFromQuote({ quote, owner: session.user, currentUser: session.user })] };
  const browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 60_000 });
  const page = await browser.newPage();
  let recorder: ScreenRecorder | undefined;
  const scenes: { start: number; caption: string }[] = [];
  let start = 0;
  const scene = (caption: string) => { scenes.push({ start: (Date.now() - start) / 1000, caption }); console.log(caption); };
  try {
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    page.on("dialog", dialog => void dialog.accept());
    page.on("pageerror", error => console.error(error));
    const cdp = await page.createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: docs });
    await page.evaluateOnNewDocument(state => {
      if (localStorage.getItem("rq-demo-seeded")) return;
      localStorage.setItem(state.directoryKey, JSON.stringify([{ ...state.session.user, password: "fictional-demo-only" }]));
      localStorage.setItem(state.authKey, JSON.stringify(state.session));
      localStorage.setItem(state.storeKey, JSON.stringify(state.store));
      localStorage.setItem(state.activeKey, state.quote.internal.quoteId);
      localStorage.setItem(state.fallbackKey, JSON.stringify(state.quote));
      sessionStorage.setItem(state.quoteKey, JSON.stringify(state.quote));
      localStorage.setItem("rq-demo-seeded", "true");
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, authKey: AUTH_STORAGE_KEY, session, storeKey: PROPOSAL_STORE_KEY, store, activeKey: ACTIVE_PROPOSAL_ID_KEY, quote, fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY, quoteKey: PROPOSAL_STORAGE_KEY });
    await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#rq-nav-customer");
    await page.click("#rq-nav-customer");
    await delay(600);
    if (!dryRun) recorder = await page.screencast({ path: path.join(output, "capture.webm") as `${string}.webm`, ffmpegPath: ffmpeg, fps: 25, quality: 18 });
    start = Date.now();
    scene("RapidQuote | Configure. Price. Quote.");
    await delay(4500);
    scene("Start with the customer and the project.");
    await page.screenshot({ path: path.join(output, "01-customer.png") });
    await delay(4000);
    await page.click("#rq-nav-items");
    await page.waitForSelector('input[aria-label="Component 1 quantity"]');
    await focusItem(page, 'input[aria-label="Component 1 quantity"]');
    scene("Equipment, installation, and monthly services in one quote.");
    await delay(5000);
    scene("Change quantities. See totals update immediately.");
    const quantity = 'input[aria-label="Component 1 quantity"]';
    await page.click(quantity, { count: 3 });
    await page.keyboard.press("Backspace");
    await page.type(quantity, "2", { delay: 150 });
    await page.keyboard.press("Tab");
    await delay(4500);
    await page.screenshot({ path: path.join(output, "02-items.png") });
    scene("Select items and preview a 30% gross margin.");
    for (const name of ["Industrial connectivity gateway", "Site installation", "Data and monitoring"]) {
      await page.$eval(`input[aria-label="Select ${name} for bulk pricing"]`, el => (el as HTMLInputElement).click());
      await delay(350);
    }
    await focusItem(page, ".rq-bulk-toolbar");
    await delay(2500);
    await clickText(page, ".rq-bulk-toolbar button", "Preview prices");
    await page.waitForSelector("dialog.rq-bulk-dialog[open]");
    scene("Review every price change before applying it.");
    await delay(5500);
    await page.screenshot({ path: path.join(output, "03-price-review.png") });
    await clickText(page, "dialog button", "Apply prices");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await page.$eval('button[aria-label="Lock unit price for Industrial connectivity gateway"]', el => (el as HTMLButtonElement).click());
    scene("Protect negotiated unit prices with a lock.");
    await focusItem(page, 'input[aria-label="Component 1 unit price"]');
    await delay(4000);
    scene("Customer options stay separate from the base price.");
    await focusItem(page, 'input[aria-label="Component 4 name"]');
    await delay(4500);
    await page.screenshot({ path: path.join(output, "04-options.png") });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.click("#rq-nav-review");
    await page.$$eval('.builder-toggle', labels => {
      const label = labels.find(el => el.textContent?.includes("I confirm these quote details"));
      const input = label?.querySelector("input") as HTMLInputElement | null;
      if (input && !input.checked) input.click();
    });
    scene("Confirm the details before sharing with the customer.");
    await delay(4000);
    await clickText(page, ".rq-review-actions button", "Customer preview");
    await page.waitForFunction(() => location.pathname === "/proposal" || location.pathname.startsWith("/proposals/"), { timeout: 30_000 });
    await page.waitForSelector(".proposal-toolbar .qe-menu");
    await delay(700);
    scene("A clean customer proposal, without internal pricing controls.");
    await page.screenshot({ path: path.join(output, "05-proposal.png") });
    await delay(5500);
    await page.evaluate(() => window.scrollBy({ top: 520, behavior: "smooth" }));
    await delay(3000);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await clickText(page, ".qe-menu > button", "Export");
    scene("Export a proposal PDF or an internal workbook.");
    await delay(2500);
    await clickText(page, ".qe-popover button", "Customer Proposal PDF");
    const downloadDeadline = Date.now() + 45_000;
    while (!readdirSync(docs).some(name => name.toLowerCase().endsWith(".pdf")) && Date.now() < downloadDeadline) await new Promise(resolve => setTimeout(resolve, 250));
    assert.ok(readdirSync(docs).some(name => name.toLowerCase().endsWith(".pdf")), "Actual proposal PDF downloaded");
    await delay(1500);
    await page.goto(new URL(`/new?proposalId=${quote.internal.quoteId}`, base).href, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#rq-nav-invoice");
    await page.click("#rq-nav-invoice");
    await page.waitForSelector("iframe.pf-preview");
    await focusItem(page, "iframe.pf-preview", 100);
    scene("Create a pro forma invoice from the same quote.");
    await delay(6000);
    await page.screenshot({ path: path.join(output, "06-invoice.png") });
    scene("RapidQuote | Less retyping. More time for the customer.");
    await delay(4500);
    const duration = (Date.now() - start) / 1000;
    await recorder?.stop();
    recorder = undefined;
    await writeFile(path.join(output, "scenes.json"), JSON.stringify({ duration, scenes, sampleData: true }, null, 2));
    if (!dryRun) {
      const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1600
PlayResY: 900
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Segoe UI,29,&H00FFFFFF,&H00FFFFFF,&H001B2228,&H001B2228,0,0,0,0,100,100,0,0,3,12,0,2,60,60,30,1
Style: Demo,Segoe UI,18,&H00FFFFFF,&H00FFFFFF,&H001B2228,&H001B2228,0,0,0,0,100,100,0,0,3,7,0,8,30,30,18,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
      const events = scenes.map((entry, index) => `Dialogue: 0,${assTime(entry.start)},${assTime(scenes[index + 1]?.start ?? duration)},Caption,,0,0,0,,${entry.caption}`).join("\n");
      await writeFile(path.join(output, "captions.ass"), `${header}${events}\nDialogue: 1,0:00:00.00,${assTime(duration)},Demo,,0,0,0,,DEMO | FICTIONAL CUSTOMER + SAMPLE PRICING\n`);
      // Hold the final frame so an idle screencast cannot truncate the closing caption.
      const encoded = spawnSync(ffmpeg, ["-y", "-i", "capture.webm", "-vf", "tpad=stop_mode=clone:stop_duration=10,ass=captions.ass", "-t", String(duration), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", "RapidQuote-Walkthrough.mp4"], { cwd: output, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
      await writeFile(path.join(output, "encoding.log"), encoded.stderr || "");
      assert.equal(encoded.status, 0, encoded.stderr);
    }
    console.log(`Demo ${dryRun ? "rehearsal" : "video"} complete: ${output}`);
  } catch (error) {
    console.error(error);
    await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => undefined);
    await writeFile(path.join(output, "failure.txt"), await page.evaluate(() => document.body.innerText).catch(() => String(error)));
    throw error;
  } finally {
    await recorder?.stop();
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { AUTH_STORAGE_KEY, USER_DIRECTORY_STORAGE_KEY, buildSession, type AuthUser } from "../app/lib/auth";
import { createBlankQuoteRecord } from "../app/lib/quote-template";
import { PROPOSAL_STORE_KEY, createProposalFromQuote } from "../app/lib/proposal-store";

async function main() {
  const base = new URL(process.env.PROPOSAL_QA_BASE_URL || "http://127.0.0.1:3047");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Smoke test is restricted to localhost.");
  const output = path.resolve(`tmp/handoff-browser-${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(p => p && existsSync(p));
  assert.ok(executablePath, "Install Chrome/Edge or configure PUPPETEER_EXECUTABLE_PATH.");
  const user: AuthUser = { id: "handoff-smoke", name: "Handoff Test", email: "handoff@example.test", title: "QA", team: "QA", role: "sales", status: "active", initials: "QA", canManageUsers: false };
  const quote = createBlankQuoteRecord();
  quote.customer.name = "Handoff smoke customer";
  quote.metadata.proposalNumber = "RQ-HANDOFF-SMOKE";
  const proposal = createProposalFromQuote({ quote, owner: user, currentUser: user });
  const store = { currentUser: user, users: [user], proposals: [proposal] };
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.evaluateOnNewDocument((seed) => {
      if (localStorage.getItem("handoff-smoke-seeded")) return;
      localStorage.setItem(seed.directoryKey, seed.directory);
      localStorage.setItem(seed.authKey, seed.session);
      localStorage.setItem(seed.storeKey, seed.store);
      localStorage.setItem("handoff-smoke-seeded", "true");
    }, { directoryKey: USER_DIRECTORY_STORAGE_KEY, directory: JSON.stringify([{ ...user, password: "synthetic-test-only" }]), authKey: AUTH_STORAGE_KEY, session: JSON.stringify(buildSession(user)), storeKey: PROPOSAL_STORE_KEY, store: JSON.stringify(store) });
    const cdp = await browser.target().createCDPSession();
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: output });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL("/workspace", base).href, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.waitForSelector(".qw-backup", { timeout: 60_000 });
    await page.click(".qw-backup summary");
    await page.$$eval(".qw-backup button", buttons => (buttons.find(b => b.textContent?.includes("Download backup")) as HTMLButtonElement).click());
    await page.waitForFunction(() => document.querySelector(".qw-backup [role=status]")?.textContent?.includes("Downloaded 1 saved quotes"), { timeout: 30_000 });
    let download: string | undefined;
    for (let i = 0; i < 30; i++) {
      download = (await readdir(output)).find(name => name.endsWith(".zip"));
      if (download) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(download, "Browser downloaded the quote backup.");
    await page.evaluate(key => {
      const data = JSON.parse(localStorage.getItem(key)!);
      data.proposals[0].quote.customer.name = "Keep this newer edit";
      localStorage.setItem(key, JSON.stringify(data));
    }, PROPOSAL_STORE_KEY);
    page.on("dialog", dialog => void dialog.accept());
    const fileInput = await page.$(".qw-backup input[type=file]");
    assert.ok(fileInput);
    await fileInput.uploadFile(path.join(output, download));
    await page.waitForFunction(() => document.querySelector(".qw-backup [role=status]")?.textContent?.includes("Restored 0 quotes; kept 1 existing matches"), { timeout: 30_000 });
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).proposals[0].quote.customer.name, PROPOSAL_STORE_KEY), "Keep this newer edit");
    await page.screenshot({ path: path.join(output, "workspace-backup.png"), fullPage: true });
    const api = await page.evaluate(async () => {
      const health = await fetch("/api/health");
      const invalid = await fetch("/api/proposal-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" });
      const form = new FormData(); form.set("file", new File(["Item,Quantity,Unit Cost\nCamera,2,100"], "bom.csv"));
      const bom = await fetch("/api/major-project-bom-parse", { method: "POST", body: form });
      return { health: health.status, invalid: invalid.status, bom: bom.status, parsed: await bom.json() };
    });
    assert.equal(api.health, 200);
    assert.equal(api.invalid, 400);
    assert.equal(api.bom, 200);
    assert.ok(api.parsed.sheets.length > 0);
    assert.deepEqual(errors, []);
    await writeFile(path.join(output, "result.json"), JSON.stringify({ passed: true, api, errors }, null, 2));
    console.log(`Browser backup/restore and health/invalid-PDF/BOM API smoke passed. Evidence: ${output}`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import {
  AUTH_STORAGE_KEY,
  USER_DIRECTORY_STORAGE_KEY,
  buildSession,
} from "../app/lib/auth";
import {
  PROPOSAL_STORAGE_KEY,
  PROPOSAL_STORAGE_FALLBACK_KEY,
} from "../app/lib/proposal-state";
import {
  PROPOSAL_STORE_KEY,
  ACTIVE_PROPOSAL_ID_KEY,
  createProposalFromQuote,
} from "../app/lib/proposal-store";
import { applyMajorProjectToQuote } from "../app/lib/major-project";
import { createBlankQuoteRecord } from "../app/lib/quote-template";
import { fixtureComponent, fixtureQuote } from "./quote-master-fixtures";

async function clickText(page: Page, selector: string, text: string) {
  await page.waitForFunction(
    (selector, text) =>
      [...document.querySelectorAll(selector)].some(
        (el) => el.textContent?.trim() === text,
      ),
    {},
    selector,
    text,
  );
  await page.$$eval(
    selector,
    (els, text) =>
      (
        els.find((el) => el.textContent?.trim() === text) as HTMLElement
      ).click(),
    text,
  );
}

async function enterLabel(page: Page, label: string, value: string) {
  const handle = await page.evaluateHandle(
    (label) =>
      [...document.querySelectorAll(".qx-form-fields label")]
        .find((el) => el.textContent?.startsWith(label))
        ?.querySelector("input"),
    label,
  );
  const input = handle.asElement() as ElementHandle<HTMLInputElement> | null;
  assert.ok(input);
  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type(value);
}

async function noOverflow(page: Page, label: string) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    label,
  );
  const dialog = await page.$("dialog[open]");
  if (dialog)
    assert.equal(
      await dialog.evaluate(
        (el) =>
          el.getBoundingClientRect().left < 0 ||
          el.getBoundingClientRect().right > innerWidth + 1 ||
          el.scrollWidth > el.clientWidth + 1,
      ),
      false,
      `${label}: dialog overflow`,
    );
}

async function main() {
  const base = new URL(
    process.env.PROPOSAL_QA_BASE_URL || "http://localhost:3017",
  );
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
  const output = path.resolve(`tmp/quote-experience-qa/${Date.now()}`);
  await mkdir(output, { recursive: true });
  const executablePath = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
  assert.ok(executablePath);
  const session = buildSession({
    id: "qa-experience",
    name: "QA Account Manager",
    email: "qa@example.test",
    title: "QA",
    team: "QA",
    role: "sales",
    status: "active",
    initials: "QA",
    canManageUsers: false,
  });
  const source = fixtureQuote("QA-EXPERIENCE", "Remote site connectivity", [
    fixtureComponent("Starlink Standard kit", 650, 400),
    fixtureComponent("Installation", 50, 20, { lineType: "installation" }),
    fixtureComponent("Data and monitoring", 100, 60, {
      lineType: "subscription",
      schedule: "recurring",
    }),
    fixtureComponent("Annual software license", 1200, 800, {
      lineType: "subscription",
      schedule: "recurring",
      billing: { cadence: "annual" },
    }),
  ]);
  source.customer.name = "River Valley Utilities";
  source.customer.addressLines = ["100 Example Road", "Austin, TX 78701"];
  source.customer.contactName = "Taylor Test";
  source.customer.contactEmail = "taylor@example.test";
  source.customer.contactPhone = "555-0100";
  source.metadata.hasActiveDataAgreement = true;
  source.majorProject.options[0].label = "Standard site";
  const alternate = structuredClone(source.majorProject.options[0]);
  alternate.id = "qa-alternate";
  alternate.label = "Performance site";
  alternate.components![0] = fixtureComponent("Performance kit", 1650, 1000);
  source.majorProject.options.push(alternate);
  const major = applyMajorProjectToQuote(source);
  const quick = createBlankQuoteRecord();
  quick.customer = structuredClone(source.customer);
  Object.assign(quick.metadata, {
    workflowMode: "quick_quote",
    proposalNumber: "QA-QUICK",
    documentTitle: "Quick site estimate",
  });
  quick.internal.quoteId = "qa-quick";
  const empty = createBlankQuoteRecord();
  empty.internal.quoteId = "qa-empty";
  const quotes = [major, quick, empty];
  const store = {
    currentUser: session.user,
    users: [session.user],
    proposals: quotes.map((quote) =>
      createProposalFromQuote({
        quote,
        owner: session.user,
        currentUser: session.user,
      }),
    ),
  };
  // Synthetic fixtures in a fresh browser profile. Never modify the user's Edge quote storage.
  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage(),
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.evaluateOnNewDocument(
      (state) => {
        if (localStorage.getItem("qa-experience-seeded")) return;
        localStorage.setItem(state.directoryKey, state.directory);
        localStorage.setItem(state.authKey, state.session);
        localStorage.setItem(state.fallbackKey, state.quote);
        localStorage.setItem(state.storeKey, state.store);
        localStorage.setItem(state.activeKey, state.activeId);
        sessionStorage.setItem(state.quoteKey, state.quote);
        localStorage.setItem("qa-experience-seeded", "true");
      },
      {
        directoryKey: USER_DIRECTORY_STORAGE_KEY,
        directory: JSON.stringify([
          { ...session.user, password: "synthetic-qa-only" },
        ]),
        authKey: AUTH_STORAGE_KEY,
        session: JSON.stringify(session),
        fallbackKey: PROPOSAL_STORAGE_FALLBACK_KEY,
        quoteKey: PROPOSAL_STORAGE_KEY,
        quote: JSON.stringify(major),
        storeKey: PROPOSAL_STORE_KEY,
        store: JSON.stringify(store),
        activeKey: ACTIVE_PROPOSAL_ID_KEY,
        activeId: major.internal.quoteId!,
      },
    );

    const widths = [1440, 1024, 785, 390, 320];
    for (const width of widths) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(new URL("/new?proposalId=qa-empty", base).href, {
        waitUntil: "networkidle0", timeout: 120_000,
      });
      await page.waitForSelector(".rq-customer-choices");
      await noOverflow(page, `Customer entry ${width}`);
      assert.equal(await page.$eval(".rq-totals", (el) => getComputedStyle(el).display), "none");
      const choices = await page.$eval(".rq-customer-choices", (el) => el.getBoundingClientRect().bottom);
      assert.ok(choices < (width < 600 ? 844 : 1000), `Customer choices visible without scrolling at ${width}`);
      const header = await page.$eval(".app-shell-header", (el) => el.getBoundingClientRect().height);
      assert.ok(header < 115, `Compact app header at ${width}`);
      await page.screenshot({ path: path.join(output, `new-quote-${width}.png`) });
    }

    for (const width of widths) {
      await page.setViewport({ width, height: width < 600 ? 844 : 1000 });
      await page.goto(
        new URL(`/new?proposalId=${major.internal.quoteId}`, base).href,
        { waitUntil: "networkidle0", timeout: 120_000 },
      );
      await page.waitForSelector(".rq-editor", { timeout: 60_000 });
      await noOverflow(page, `Editor ${width}`);
      await page.screenshot({ path: path.join(output, `editor-${width}.png`) });
      await clickText(page, ".rq-items-toolbar button", "Product library");
      await page.waitForSelector("dialog[open] .qx-products");
      await page.type('input[aria-label="Search products"]', "Standard Wall");
      await page.click(".qx-product");
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".qx-detail-image")].every(
          (el) =>
            (el as HTMLImageElement).complete &&
            (el as HTMLImageElement).naturalWidth > 0,
        ),
      );
      assert.equal(
        await page.$eval(
          ".qx-form-fields label:nth-of-type(3) input",
          (el) => (el as HTMLInputElement).value,
        ),
        "67",
      );
      assert.equal(
        await page.$eval(
          ".qx-form-fields label:nth-of-type(4) input",
          (el) => (el as HTMLInputElement).value,
        ),
        "",
      );
      const libraryText = await page.$eval(
        "dialog[open]",
        (el) => el.textContent || "",
      );
      assert.doesNotMatch(libraryText, /Best Buy|CDW|Seller|MSRP/i);
      assert.match(libraryText, /Starlink-direct price unconfirmed/);
      await noOverflow(page, `Library ${width}`);
      const footer = await page.$eval(".qx-detail-footer", (el) => ({
        top: el.getBoundingClientRect().top,
        bottom: el.getBoundingClientRect().bottom,
      }));
      assert.ok(
        footer.top >= 0 && footer.bottom <= (width < 600 ? 844 : 1000),
        `Product add control stays visible at ${width}`,
      );
      const thumbnail = await page.$eval(
        ".qx-product-visual img",
        (el) => el.getBoundingClientRect().height,
      );
      assert.ok(thumbnail <= 48, "Product thumbnail stays in its frame");
      await page.screenshot({
        path: path.join(output, `library-${width}.png`),
      });
      if (width === 1440) {
        await clickText(page, ".qx-product-detail button", "Add to quote");
        await page.waitForSelector(".qx-error");
        await enterLabel(page, "Our cost", "50");
        await page.click(".qx-checkbox input");
        await clickText(page, ".qx-product-detail button", "Add to quote");
        await page.waitForFunction(
          () => !document.querySelector("dialog[open]"),
        );
        assert.match(
          await page.$eval(".rq-editor", (el) => el.textContent || ""),
          /Standard Wall Mount/,
        );
        await clickText(page, ".rq-editor-actions button", "Save");
      } else await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector("dialog[open]"));
      await page.click(".rq-nav-compare");
      await page.waitForSelector(".qx-comparison");
      assert.equal(
        await page.$$eval(".qx-comparison thead th", (els) => els.length),
        3,
      );
      await noOverflow(page, `Comparison ${width}`);
      await page.screenshot({
        path: path.join(output, `comparison-${width}.png`),
      });
      await clickText(page, ".qx-tabs button", "Purchase & lease");
      assert.equal(
        await page.$$eval(".qx-comparison thead th", (els) => els.length),
        8,
      );
      await noOverflow(page, `Lease ${width}`);
      await page.screenshot({ path: path.join(output, `leases-${width}.png`) });
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.classList.contains("rq-nav-compare"),
        ),
        true,
      );
      await page.click('button[aria-label="Present to customer"]');
      await page.waitForSelector(".qx-presentation .customer-proposal");
      const text = await page.$eval(
        ".qx-presentation",
        (el) => el.textContent || "",
      );
      assert.doesNotMatch(
        text,
        /target margin|gross profit|vendor cost|our cost|internal monthly cost|Best Buy|CDW|Export|Save quote/i,
      );
      assert.match(text, /River Valley Utilities/);
      assert.equal(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
      await noOverflow(page, `Presentation ${width}`);
      await page.screenshot({
        path: path.join(output, `presentation-${width}.png`),
      });
      await page.keyboard.press("Escape");
      assert.notEqual(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
      for (const tab of [
        "customer",
        "pricing",
        "documents",
        "review",
        "items",
      ]) {
        await page.click(`#rq-nav-${tab}`);
        await noOverflow(page, `${tab} ${width}`);
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: path.join(output, `${tab}-${width}.png`),
          });
      }
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await page.click(".rq-nav-compare");
    await page.waitForSelector(".qx-comparison");
    await page.click('button[aria-label="Use Performance site"]');
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.match(
      await page.$eval(".rq-active-option", (el) => el.textContent || ""),
      /Performance site/,
    );
    await page.click(".rq-nav-compare");
    await page.waitForSelector(".qx-comparison");
    await clickText(page, ".qx-tabs button", "Purchase & lease");
    await page.click('button[aria-label="Use 3-month lease"]');
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    await clickText(page, ".rq-editor-actions button", "Save");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(".rq-active-option");
    assert.match(
      await page.$eval(".rq-active-option", (el) => el.textContent || ""),
      /Performance site/,
    );
    assert.match(
      await page.$eval(".rq-totals-main", (el) => el.textContent || ""),
      /3.month/i,
    );

    await page.goto(new URL("/new?proposalId=qa-quick", base).href, {
      waitUntil: "networkidle0",
      timeout: 120_000,
    });
    await page.waitForSelector(".rq-editor");
    await clickText(page, ".rq-items-toolbar button", "Product library");
    await page.waitForSelector("dialog[open]");
    await page.type(
      'input[aria-label="Search products"]',
      "Standard Pipe Adapter",
    );
    await page.click(".qx-product");
    assert.doesNotMatch(
      await page.$eval(".qx-form-fields", (el) => el.textContent || ""),
      /Our cost/,
    );
    await clickText(page, ".qx-product-detail button", "Add to quote");
    await page.waitForFunction(() => !document.querySelector("dialog[open]"));
    assert.match(
      await page.$eval(".rq-editor", (el) => el.textContent || ""),
      /Standard Pipe Adapter/,
    );
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(output, "result.json"),
      JSON.stringify(
        { result: "PASS", viewports: widths, output },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ result: "PASS", output }));
  } finally {
    await browser.close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IliosEstimateDocument } from "../components/ilios-estimate-document";
import { fixtureComponent, fixtureQuote } from "../../scripts/quote-master-fixtures";
import { prepareProFormaFixture } from "../../scripts/pro-forma-fixtures";
import { buildEstimateTemplateModel } from "./estimate-template";
import { finalReviewKey } from "./final-quote-review";
import { buildProFormaInvoice } from "./pro-forma";
import { buildProFormaHtml } from "./pro-forma-html";
import { applyMajorProjectToQuote, convertMajorProjectQuickBuilderToMappedModel, convertQuickQuoteToMajorProject, ensureMajorProjectState } from "./major-project";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { createProposalCopy, createProposalFromQuote } from "./proposal-store";
import type { MajorProjectComponent, MajorProjectSimpleRow, QuoteRecord } from "./quote-record";
import { createBlankQuoteRecord } from "./quote-template";
import { applyBulkMargin, getBulkPricingLines, preserveLockedUnitPrice, previewBulkMargin, setBulkPriceLocks } from "./quote-bulk-pricing";

function sample(components = [fixtureComponent("hardware", 120, 70)]) {
  return fixtureQuote("bulk-pricing-test", "Bulk margin QA", components);
}

function first(quote: QuoteRecord) {
  return quote.majorProject.options[0].components![0];
}

function simpleRow(changes: Partial<MajorProjectSimpleRow> = {}): MajorProjectSimpleRow {
  return { id: "simple", label: "Simple hardware", quantity: 2, unit: "ea", customerUnitPrice: 100, customerExtendedPrice: 200, ourUnitCost: 60, ourExtendedCost: 120, bucket: "hardware", ...changes };
}

function withSimpleRows(rows = [simpleRow()]) {
  const quote = sample();
  quote.majorProject.builderMode = "simple";
  quote.majorProject.options[0].simpleRows = rows;
  return quote;
}

test("bulk margin rounds the unit price to cents before extending by quantity", () => {
  const quote = sample([fixtureComponent("hardware", 3, 1, { quantity: 3, customerUnitPrice: 1, vendorUnitCost: 0.333, vendorExtendedCost: 1 })]);
  const preview = previewBulkMargin(quote, ["hardware"], 30);
  assert.equal(preview.entries[0].newUnitPrice, 0.48);
  assert.equal(preview.entries[0].newExtendedPrice, 1.44);
  assert.deepEqual(preview.totals.oneTime, { current: 3, proposed: 1.44, change: -1.56, lineCount: 1 });
  const result = applyBulkMargin(quote, preview);
  assert.equal(first(result.quote).customerUnitPrice, 0.48);
  assert.equal(first(result.quote).customerExtendedPrice, 1.44);
  assert.equal(first(quote).customerExtendedPrice, 3);
});

test("bulk margin supports common margins and inclusive boundary values", () => {
  const quote = sample([fixtureComponent("hardware", 100, 85)]);
  for (const margin of [0, 15, 30, 55, 95]) {
    const preview = previewBulkMargin(quote, ["hardware"], margin);
    assert.equal(preview.error, null);
    assert.equal(preview.entries[0].newUnitPrice, Math.round((85 / (1 - margin / 100) + Number.EPSILON) * 100) / 100);
    assert.equal(applyBulkMargin(quote, preview).updatedCount, 1);
  }
});

test("invalid margins are rejected, never clamped", () => {
  for (const margin of [-1, 95.01, 100, NaN, Infinity, -Infinity, "30" as unknown as number]) {
    const quote = sample();
    const preview = previewBulkMargin(quote, ["hardware"], margin);
    assert.match(preview.error!, /0% to 95%/);
    assert.equal(preview.applicableCount, 0);
    assert.equal(preview.entries[0].newUnitPrice, null);
    assert.throws(() => applyBulkMargin(quote, preview), /0% to 95%/);
    assert.equal(first(quote).customerUnitPrice, 120);
  }
});

test("duplicate selections are counted and updated only once", () => {
  const quote = sample();
  const preview = previewBulkMargin(quote, ["hardware", "hardware", "unknown", "unknown"], 30);
  assert.equal(preview.selectionCount, 2);
  assert.equal(preview.applicableCount, 1);
  assert.equal(preview.skippedCount, 1);
  assert.match(preview.entries[1].skippedReason!, /not in the active option/);
  assert.equal(applyBulkMargin(quote, preview).updatedCount, 1);
});

test("empty selections have no financial changes", () => {
  const quote = sample();
  const preview = previewBulkMargin(quote, [], 30);
  assert.equal(preview.selectionCount, 0);
  assert.equal(preview.applicableCount, 0);
  assert.equal(applyBulkMargin(quote, preview).quote, quote);
});

test("one-time, monthly, annual and usage changes are never combined into a fake total", () => {
  const quote = sample([
    fixtureComponent("hardware", 120, 70),
    fixtureComponent("monthly", 20, 7, { schedule: "recurring" }),
    fixtureComponent("annual", 240, 140, { billing: { cadence: "annual", startsYear: 2 } }),
    fixtureComponent("GB rate", 0, 0, { quantity: 0, unit: "GB", customerUnitPrice: 2, vendorUnitCost: 0.7, schedule: "recurring", quickQuoteSource: { section: "sectionA", rowId: "overage", usageBased: true } }),
    fixtureComponent("TB rate", 0, 7, { unit: "TB", customerUnitPrice: 20, schedule: "recurring", quickQuoteSource: { section: "sectionA", rowId: "other-overage", usageBased: true } }),
  ]);
  const preview = previewBulkMargin(quote, getBulkPricingLines(quote).map(row => row.id), 30);
  assert.equal(preview.applicableCount, 5);
  assert.deepEqual(preview.totals.oneTime, { current: 120, proposed: 100, change: -20, lineCount: 1 });
  assert.deepEqual(preview.totals.monthly, { current: 20, proposed: 10, change: -10, lineCount: 1 });
  assert.deepEqual(preview.totals.annual, { current: 240, proposed: 200, change: -40, lineCount: 1 });
  assert.deepEqual(preview.totals.usage.map(row => [row.unit, row.current, row.proposed]), [["GB", 2, 1], ["TB", 20, 10]]);
  assert.equal(preview.entries[2].startsYear, 2);
  const updated = applyBulkMargin(quote, preview).quote;
  assert.equal(updated.majorProject.options[0].components![3].customerExtendedPrice, 0);
});

test("locked, Included, pass-through and aggregate cost rows carry clear skip reasons", () => {
  const quote = sample([
    fixtureComponent("locked", 120, 70, { priceLocked: true }),
    fixtureComponent("included", 0, 70, { priceStatus: "included" }),
    fixtureComponent("pass", 70, 70, { passThrough: true }),
    fixtureComponent("resale-pass", 70, 70, { resaleBasis: "pass_through" }),
    fixtureComponent("quick-quote-cost-oneTimeEquipmentCost", 0, 700, { customerFacingLabel: "" }),
    fixtureComponent("normal", 120, 70),
  ]);
  const lines = getBulkPricingLines(quote);
  assert.deepEqual(lines.map(row => row.eligible), [false, false, false, false, false, true]);
  assert.match(lines[0].skippedReason!, /locked/);
  assert.match(lines[1].skippedReason!, /No extra charge/);
  assert.match(lines[2].skippedReason!, /Pass-through/);
  assert.match(lines[3].skippedReason!, /Pass-through/);
  assert.match(lines[4].skippedReason!, /aggregate cost/);
  const result = applyBulkMargin(quote, previewBulkMargin(quote, lines.map(row => row.id), 30));
  assert.equal(result.updatedCount, 1);
  assert.equal(result.skippedCount, 5);
  assert.deepEqual(result.quote.majorProject.options[0].components!.slice(0, 5), quote.majorProject.options[0].components!.slice(0, 5));
});

test("invalid, missing, zero and inconsistent costs skip rather than guessing", () => {
  const invalidCosts: Partial<MajorProjectComponent>[] = [
    { vendorUnitCost: 0, vendorExtendedCost: 0 },
    { vendorUnitCost: undefined }, { vendorUnitCost: NaN }, { vendorUnitCost: Infinity },
    { vendorUnitCost: "70" as unknown as number }, { vendorExtendedCost: undefined }, { vendorExtendedCost: NaN },
    { vendorExtendedCost: 0 }, { vendorExtendedCost: 71 }, { quantity: 2, vendorExtendedCost: 70 },
  ];
  for (const values of invalidCosts) {
    const quote = sample([fixtureComponent("hardware", 120, 70, values)]);
    const preview = previewBulkMargin(quote, ["hardware"], 30);
    assert.equal(preview.applicableCount, 0, JSON.stringify(values));
    assert.match(preview.entries[0].skippedReason!, /cost/);
    assert.equal(applyBulkMargin(quote, preview).quote, quote);
  }
});

test("negative prices, negative costs and negative quantities are treated as credits", () => {
  for (const values of [{ customerUnitPrice: -10 }, { customerExtendedPrice: -10 }, { vendorUnitCost: -10 }, { vendorExtendedCost: -10 }, { quantity: -1 }]) {
    const quote = sample([fixtureComponent("hardware", 120, 70, values)]);
    const line = getBulkPricingLines(quote)[0];
    assert.equal(line.eligible, false);
    assert.match(line.skippedReason!, /Credits/);
  }
});

test("invalid quantities and prices cannot be silently repaired by bulk pricing", () => {
  for (const values of [{ quantity: 0 }, { quantity: NaN }, { quantity: Infinity }, { customerUnitPrice: NaN }, { customerExtendedPrice: Infinity }]) {
    assert.equal(getBulkPricingLines(sample([fixtureComponent("hardware", 120, 70, values)]))[0].eligible, false);
  }
  const usage = fixtureComponent("usage", 10, 70, { quickQuoteSource: { section: "sectionA", rowId: "usage", usageBased: true } });
  assert.match(getBulkPricingLines(sample([usage]))[0].skippedReason!, /Usage rates/);
});

test("prices that exceed a reliable currency range are skipped", () => {
  const quote = sample([fixtureComponent("hardware", 120, 10_000_000_000_000)]);
  const preview = previewBulkMargin(quote, ["hardware"], 95);
  assert.equal(preview.applicableCount, 0);
  assert.match(preview.entries[0].skippedReason!, /currency range/);
});

test("valid bulk pricing confirms TBD, keeps Allowance, and preserves all non-price source information", () => {
  const source = fixtureComponent("hardware", 0, 140, {
    priceStatus: "tbd", quantity: 2, vendorUnitCost: 70, customerUnitPrice: 0,
    optional: true, customerFacingLabel: "Customer hardware", notes: "Keep internal notes", unit: "kits",
    specSheetAttachment: { fileName: "hardware.pdf", storageKey: "spec:hardware", mimeType: "application/pdf", sizeBytes: 50, updatedAt: "2026-11-18T00:00:00Z" },
    billing: { cadence: "annual", startsYear: 2, unitLabel: "kits" },
  });
  const quote = sample([source, fixtureComponent("allowance", 120, 70, { priceStatus: "allowance" })]);
  const preview = previewBulkMargin(quote, ["hardware", "allowance"], 30);
  assert.equal(preview.entries[0].newPriceStatus, "confirmed");
  assert.equal(preview.entries[1].newPriceStatus, "allowance");
  const result = applyBulkMargin(quote, preview);
  assert.deepEqual(first(result.quote), { ...source, priceStatus: "confirmed", customerUnitPrice: 100, customerExtendedPrice: 200 });
  assert.equal(result.quote.majorProject.options[0].components![1].priceStatus, "allowance");
  assert.equal(first(quote).customerUnitPrice, 0);
  assert.equal(first(quote).priceStatus, "tbd");
});

test("unpriced legacy rows become Confirmed, but skipped TBD rows are not confirmed", () => {
  const quote = sample([
    fixtureComponent("legacy", 0, 70),
    fixtureComponent("locked", 0, 70, { priceStatus: "tbd", priceLocked: true }),
    fixtureComponent("no-cost", 0, 0, { priceStatus: "tbd" }),
    fixtureComponent("included", 0, 70, { priceStatus: "included" }),
  ]);
  const result = applyBulkMargin(quote, previewBulkMargin(quote, ["legacy", "locked", "no-cost", "included"], 30));
  assert.equal(result.updatedCount, 1);
  assert.deepEqual(result.quote.majorProject.options[0].components!.map(row => row.priceStatus), ["confirmed", "tbd", "tbd", "included"]);
});

test("Quick Quote alone exposes no bulk margin lines and never invents per-item costs", () => {
  const quote = createBlankQuoteRecord();
  quote.commercial.costs.oneTimeEquipmentCost = 500;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "hardware", sourceType: "custom", itemName: "Terminal", quantity: 1, unitPrice: 900, totalPrice: 900 }];
  assert.deepEqual(getBulkPricingLines(quote), []);
  const quickPreview = previewBulkMargin(quote, ["hardware"], 30);
  assert.match(quickPreview.error!, /Major Project/);
  assert.throws(() => applyBulkMargin(quote, quickPreview), /Major Project/);
  const converted = convertQuickQuoteToMajorProject(quote);
  const lines = getBulkPricingLines(converted);
  assert.equal(lines.some(row => row.eligible), false);
  assert.match(lines.find(row => row.id === "hardware")!.skippedReason!, /unit cost/);
  assert.match(lines.find(row => row.id.startsWith("quick-quote-cost-"))!.skippedReason!, /aggregate/);
});

test("only the active option and current editor mode can be priced or locked", () => {
  const quote = withSimpleRows();
  const other = structuredClone(quote.majorProject.options[0]);
  other.id = "other-option";
  other.simpleRows = [simpleRow({ id: "other-simple" })];
  quote.majorProject.options.push(other);
  assert.deepEqual(getBulkPricingLines(quote).map(line => line.id), ["simple"]);
  const preview = previewBulkMargin(quote, ["simple", "hardware", "other-simple"], 50);
  const result = applyBulkMargin(quote, preview);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.quote.majorProject.options[0].simpleRows![0].customerExtendedPrice, 240);
  assert.deepEqual(result.quote.majorProject.options[0].components, quote.majorProject.options[0].components);
  assert.equal(result.quote.majorProject.options[1], quote.majorProject.options[1]);
  const locked = setBulkPriceLocks(quote, ["simple", "hardware", "other-simple"], true);
  assert.equal(locked.majorProject.options[0].simpleRows![0].priceLocked, true);
  assert.equal(first(locked).priceLocked, undefined);
  assert.equal(locked.majorProject.options[1], quote.majorProject.options[1]);
});

test("simple row annual billing and lock status are represented without changing the source", () => {
  const quote = withSimpleRows([simpleRow({ billing: { cadence: "annual", startsYear: 2, unitLabel: "camera" }, priceLocked: true })]);
  const [line] = getBulkPricingLines(quote);
  assert.equal(line.cadence, "annual");
  assert.equal(line.startsYear, 2);
  assert.equal(line.unit, "camera");
  assert.equal(line.priceLocked, true);
  assert.equal(line.eligible, false);
});

test("ambiguous duplicate item IDs are not partially repriced", () => {
  const quote = sample([fixtureComponent("same", 120, 70), fixtureComponent("same", 240, 140)]);
  const preview = previewBulkMargin(quote, ["same"], 30);
  assert.equal(preview.applicableCount, 0);
  assert.match(preview.entries[0].skippedReason!, /duplicated/);
  assert.equal(applyBulkMargin(quote, preview).quote, quote);
});

test("changed selected pricing inputs invalidate the entire preview, without partial application", () => {
  const changes: Partial<MajorProjectComponent>[] = [
    { quantity: 2 }, { vendorUnitCost: 80 }, { vendorExtendedCost: 80 },
    { customerUnitPrice: 140 }, { customerExtendedPrice: 140 }, { priceLocked: true },
    { priceStatus: "tbd" }, { priceStatus: "included" }, { optional: true },
    { billing: { cadence: "annual" } }, { unit: "GB" }, { schedule: "recurring" },
    { passThrough: true }, { resaleBasis: "pass_through" }, { costBasis: "msrp" },
    { quickQuoteSource: { section: "sectionA", rowId: "hardware", usageBased: true } },
    { laborTasks: [{ id: "labor", task: "Install", role: "Installer", people: 1, hours: 1, hourlyCost: 80 }] },
  ];
  for (const change of changes) {
    const quote = sample([fixtureComponent("hardware", 120, 70), fixtureComponent("other", 240, 140)]);
    const preview = previewBulkMargin(quote, ["hardware", "other"], 30);
    Object.assign(first(quote), change);
    assert.throws(() => applyBulkMargin(quote, preview), /Refresh the margin preview/, JSON.stringify(change));
    assert.equal(quote.majorProject.options[0].components![1].customerUnitPrice, 240);
  }
});

test("quote, option, mode, workflow and currency changes invalidate previews", () => {
  const changes: Array<(quote: QuoteRecord) => void> = [
    quote => { quote.internal.quoteId = "another-quote"; },
    quote => { quote.majorProject.activeOptionId = "another-option"; },
    quote => { quote.majorProject.builderMode = "simple"; },
    quote => { quote.metadata.workflowMode = "quick_quote"; },
    quote => { quote.majorProject.enabled = false; },
    quote => { quote.metadata.currencyCode = "EUR"; },
  ];
  for (const change of changes) {
    const quote = sample();
    const preview = previewBulkMargin(quote, ["hardware"], 30);
    change(quote);
    assert.throws(() => applyBulkMargin(quote, preview), /Refresh the margin preview/);
  }
});

test("deleting or replacing a selected item requires a fresh preview", () => {
  const quote = sample();
  const preview = previewBulkMargin(quote, ["hardware"], 30);
  quote.majorProject.options[0].components = [];
  assert.throws(() => applyBulkMargin(quote, preview), /Refresh the margin preview/);
  const missingPreview = previewBulkMargin(quote, ["hardware"], 30);
  quote.majorProject.options[0].components.push(fixtureComponent("hardware", 120, 70));
  assert.throws(() => applyBulkMargin(quote, missingPreview), /Refresh the margin preview/);
});

test("unselected pricing and unrelated notes can change without invalidating a preview", () => {
  const quote = sample([fixtureComponent("hardware", 120, 70), fixtureComponent("other", 240, 140)]);
  const preview = previewBulkMargin(quote, ["hardware"], 30);
  first(quote).notes = "New note";
  quote.majorProject.options[0].components![1].customerUnitPrice = 500;
  const result = applyBulkMargin(quote, preview);
  assert.equal(first(result.quote).customerUnitPrice, 100);
  assert.equal(first(result.quote).notes, "New note");
  assert.equal(result.quote.majorProject.options[0].components![1].customerUnitPrice, 500);
});

test("apply recalculates trusted amounts instead of taking mutated preview prices", () => {
  const quote = sample();
  const preview = previewBulkMargin(quote, ["hardware"], 30);
  preview.entries[0].newUnitPrice = 1;
  preview.entries[0].newExtendedPrice = 1;
  preview.entries[0].eligible = false;
  const result = applyBulkMargin(quote, preview);
  assert.equal(first(result.quote).customerUnitPrice, 100);
  assert.equal(result.updatedCount, 1);
  preview.marginPercent = 55;
  assert.throws(() => applyBulkMargin(quote, preview), /Refresh the margin preview/);
});

test("lock toggles preserve all prices and invalidate existing previews", () => {
  const quote = sample();
  const preview = previewBulkMargin(quote, ["hardware"], 30);
  const locked = setBulkPriceLocks(quote, ["hardware", "hardware"], true);
  assert.deepEqual(first(locked), { ...first(quote), priceLocked: true });
  assert.equal(first(quote).priceLocked, undefined);
  assert.throws(() => applyBulkMargin(locked, preview), /Refresh the margin preview/);
  const unlocked = setBulkPriceLocks(locked, ["hardware"], false);
  assert.equal(getBulkPricingLines(unlocked)[0].eligible, true);
  assert.equal(first(unlocked).customerExtendedPrice, 120);
});

test("locked rates survive save, reload, copy and simple-to-advanced conversion", () => {
  const quote = withSimpleRows([simpleRow({ priceLocked: true, priceStatus: "allowance" })]);
  quote.majorProject.options[0].components = [];
  const converted = convertMajorProjectQuickBuilderToMappedModel(quote);
  assert.equal(first(converted).priceLocked, true);
  assert.equal(first(converted).customerUnitPrice, 100);
  assert.equal(first(converted).customerExtendedPrice, 200);
  const restored = deserializeQuoteRecord(serializeQuoteRecord(converted));
  assert.ok(restored);
  assert.equal(first(restored).priceLocked, true);
  assert.equal(restored.majorProject.options[0].simpleRows![0].priceLocked, true);
  const copied = createProposalCopy({ proposal: createProposalFromQuote({ quote: restored }) });
  assert.equal(first(copied.quote).priceLocked, true);
  assert.equal(first(copied.quote).priceStatus, "allowance");
  assert.equal(first(applyMajorProjectToQuote(copied.quote)).priceLocked, true);
});

test("normalization keeps legacy locks optional and rejects malformed truthy values", () => {
  const quote = sample([fixtureComponent("hardware", 120, 70, { priceLocked: "false" as unknown as boolean })]);
  const normalized = ensureMajorProjectState(quote);
  assert.equal(first(normalized).priceLocked, undefined);
  assert.equal(first(ensureMajorProjectState(setBulkPriceLocks(quote, ["hardware"], false))).priceLocked, false);
});

test("locks survive repeated Quick Quote and Major Project switches with unchanged scope", () => {
  let quote = applyMajorProjectToQuote(setBulkPriceLocks(sample(), ["hardware"], true));
  const optionCount = quote.majorProject.options.length;
  for (let index = 0; index < 3; index += 1) {
    quote.metadata.workflowMode = "quick_quote";
    quote = convertQuickQuoteToMajorProject(deserializeQuoteRecord(serializeQuoteRecord(quote))!);
    assert.equal(quote.majorProject.options.length, optionCount);
    assert.equal(first(quote).priceLocked, true);
    assert.equal(first(quote).customerUnitPrice, 120);
  }
});

test("defensive locked-price update retains a negotiated custom total when quantity is unchanged", () => {
  const previous = fixtureComponent("hardware", 1000, 700, { priceLocked: true, quantity: 10, customerUnitPrice: 110 });
  const next = preserveLockedUnitPrice(previous, { ...previous, customerUnitPrice: 200, customerExtendedPrice: 2000, notes: "Updated note" });
  assert.equal(next.customerUnitPrice, 110);
  assert.equal(next.customerExtendedPrice, 1000);
  assert.equal(next.notes, "Updated note");
  assert.equal(previous.customerExtendedPrice, 1000);
});

test("defensive locked-price update recalculates quantity against the previous unit rate", () => {
  const previous = simpleRow({ priceLocked: true, quantity: 3, customerUnitPrice: 12.35, customerExtendedPrice: 35 });
  const next = preserveLockedUnitPrice(previous, { ...previous, quantity: 2.5, customerUnitPrice: 50, customerExtendedPrice: 125 });
  assert.equal(next.customerUnitPrice, 12.35);
  assert.equal(next.customerExtendedPrice, 30.88);
});

test("unlock and reprice are separate updates; an unlock cannot also overwrite the locked rate", () => {
  const previous = simpleRow({ priceLocked: true, customerUnitPrice: 100, customerExtendedPrice: 190 });
  const unlocked = preserveLockedUnitPrice(previous, { ...previous, priceLocked: false, customerUnitPrice: 200, customerExtendedPrice: 400 });
  assert.equal(unlocked.priceLocked, false);
  assert.equal(unlocked.customerUnitPrice, 100);
  assert.equal(unlocked.customerExtendedPrice, 190);
  const edited = { ...unlocked, customerUnitPrice: 200, customerExtendedPrice: 400 };
  assert.equal(preserveLockedUnitPrice(unlocked, edited), edited);
});

test("normalizers permit restoring a different negotiated rate without global lock enforcement", () => {
  const quote = sample([fixtureComponent("hardware", 145, 70, { priceLocked: true, customerUnitPrice: 150 })]);
  const restored = ensureMajorProjectState(quote);
  assert.equal(first(restored).customerUnitPrice, 150);
  assert.equal(first(restored).customerExtendedPrice, 145);
});

test("parent output mapping reflects the bulk prices and does not expose margin metadata", () => {
  const quote = sample([fixtureComponent("hardware", 0, 70, { priceStatus: "tbd" })]);
  const updated = applyBulkMargin(quote, previewBulkMargin(quote, ["hardware"], 30)).quote;
  const mapped = applyMajorProjectToQuote(updated);
  const row = mapped.sections.sectionB.lineItems.find(row => row.id === "hardware");
  assert.ok(row);
  assert.equal(row.unitPrice, 100);
  assert.equal(row.totalPrice, 100);
  assert.equal(row.priceStatus, "confirmed");
  assert.equal(first(mapped).priceStatus, "confirmed");
  assert.equal(mapped.sections.sectionB.computed.equipmentTotal, 100);
  assert.equal("marginPercent" in row, false);
  assert.equal("priceLocked" in row, false);
});

test("simple and mapped customer output receive Confirmed after valid TBD repricing", () => {
  const quote = withSimpleRows([simpleRow({ priceStatus: "tbd", customerUnitPrice: 0, customerExtendedPrice: 0 })]);
  quote.majorProject.options[0].components = [];
  const updated = applyBulkMargin(quote, previewBulkMargin(quote, ["simple"], 40)).quote;
  assert.equal(updated.majorProject.options[0].simpleRows![0].priceStatus, "confirmed");
  const projected = applyMajorProjectToQuote(updated);
  assert.equal(first(projected).priceStatus, "confirmed");
  const row = projected.sections.sectionB.lineItems.find(row => row.itemName.includes("Simple hardware"));
  assert.ok(row);
  assert.equal(row.priceStatus, "confirmed");
  assert.equal(row.totalPrice, 200);
});

const PRIVATE_BULK_VENDOR = "PRIVATE_VENDOR_BULK_71849";
const PRIVATE_BULK_COSTS = [73.59, 23.87, 115.71, 31.17, 46.83, 83.23, 111.11, 8.53];

function customerOutputAfterBulkPricing() {
  const components = [
    fixtureComponent("Required controller", 0, PRIVATE_BULK_COSTS[0], { priceStatus: "tbd" }),
    fixtureComponent("Base monitoring", 0, PRIVATE_BULK_COSTS[1], { priceStatus: "tbd", lineType: "subscription", schedule: "recurring", billing: { cadence: "monthly" } }),
    fixtureComponent("Annual analytics", 0, PRIVATE_BULK_COSTS[2], { priceStatus: "tbd", lineType: "subscription", billing: { cadence: "annual" } }),
    fixtureComponent("Optional mounting kit", 0, PRIVATE_BULK_COSTS[3], { priceStatus: "tbd", optional: true }),
    fixtureComponent("Optional premium monitoring", 0, PRIVATE_BULK_COSTS[4], { priceStatus: "tbd", optional: true, lineType: "subscription", schedule: "recurring", billing: { cadence: "monthly" } }),
    fixtureComponent("Optional support renewal", 0, PRIVATE_BULK_COSTS[5], { priceStatus: "tbd", optional: true, lineType: "subscription", billing: { cadence: "annual", startsYear: 2 } }),
    fixtureComponent("Negotiated enclosure", 222.22, PRIVATE_BULK_COSTS[6], { priceStatus: "confirmed", priceLocked: true }),
    fixtureComponent("Included commissioning", 0, PRIVATE_BULK_COSTS[7], { priceStatus: "included" }),
  ].map(row => ({ ...row, vendor: PRIVATE_BULK_VENDOR }));
  const source = fixtureQuote("RQ-OUTPUT-TEST", "Monitoring and controls", components);
  source.metadata.companyKey = "ilios";
  source.metadata.outputTemplateKey = "estimate_compact";
  source.metadata.salesTaxAmount = 0;
  source.metadata.leaseMarginPercent = 37.42;
  const preview = previewBulkMargin(source, components.map(row => row.id), 30);
  const result = applyBulkMargin(source, preview);
  assert.equal(result.updatedCount, 6);
  assert.equal(result.skippedCount, 2);
  const quote = prepareProFormaFixture(applyMajorProjectToQuote(result.quote));
  quote.orderProcessing!.requirements!.equipment = Object.fromEntries(quote.sections.sectionB.lineItems.map(row => [row.id, { kind: "standalone" as const, assemblyDetails: "" }]));
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  return quote;
}

function assertCustomerPricingPrivacy(html: string) {
  assert.ok(html.length > 1000, "The real customer renderer must produce nonempty HTML.");
  assert.equal(html.includes(PRIVATE_BULK_VENDOR), false, "Internal vendor identity must stay private.");
  for (const cost of PRIVATE_BULK_COSTS) {
    assert.equal(html.includes(`$${cost.toFixed(2)}`), false, `Vendor cost ${cost} must not appear in customer HTML.`);
  }
  assert.doesNotMatch(html, /vendorUnitCost|vendorExtendedCost|ourUnitCost|ourExtendedCost|priceLocked|bulk.?margin|target.?margin|gross.?profit|unit cost|extended cost|lock selling price|unlock selling price|price lock/i);
  assert.doesNotMatch(html, />[^<>]*(?:30|37\.42)\s*%[^<>]*</, "Internal margin percentages must not be rendered as customer text.");
  assert.doesNotMatch(html, /<(?:input|select|button)\b/i, "Builder pricing controls must not leak into customer documents.");
  assert.doesNotMatch(html, /Draft pricing is incomplete|Pricing needs review|\bTBD\b/);
}

test("real Ilios customer HTML after bulk pricing hides vendor costs, margins and lock controls", () => {
  const quote = customerOutputAfterBulkPricing();
  assert.equal(quote.majorProject.options[0].components!.find(row => row.id === "Negotiated enclosure")!.priceLocked, true);
  assert.equal(first(quote).vendor, PRIVATE_BULK_VENDOR);
  assert.equal(first(quote).vendorUnitCost, PRIVATE_BULK_COSTS[0]);
  const html = renderToStaticMarkup(createElement(IliosEstimateDocument, { quote }));
  assertCustomerPricingPrivacy(html);
  assert.match(html, /Required controller[\s\S]*?\$105\.13/);
  assert.match(html, /Negotiated enclosure[\s\S]*?\$222\.22/);
  assert.match(html, /Included commissioning[\s\S]*?>Included<\/td>/);
});

test("real Ilios customer HTML keeps optional prices outside base totals and monthly charges separate from annual charges", () => {
  const quote = customerOutputAfterBulkPricing();
  const model = buildEstimateTemplateModel(quote)!;
  assert.ok(model);
  assert.equal(model.total.toFixed(2), "492.65");
  assert.equal(model.monthlyTotal, 34.1);
  assert.equal(model.annual.firstYearTotal, 165.3);
  assert.equal(model.annual.renewalTotal, 165.3);
  assert.equal(model.optionCostOneTimeTotal, 44.53);
  assert.equal(model.optionCostMonthlyTotal, 66.9);
  assert.equal(model.optionCostAnnualTotal, 118.9);
  assert.equal(model.lineItems.some(row => row.label.startsWith("Optional")), false);
  assert.equal(model.annual.items.some(row => row.label.startsWith("Optional")), false);
  const html = renderToStaticMarkup(createElement(IliosEstimateDocument, { quote }));
  assert.match(html, /These options are not included in the base estimate total unless selected\./);
  assert.match(html, /Option Costs[\s\S]*?Optional mounting kit[\s\S]*?\$44\.53/);
  assert.match(html, /Monthly option total<\/span><strong[^>]*>\$66\.90 \/ mo<\/strong>/);
  assert.match(html, /Annual renewal options<\/span><strong[^>]*>\$118\.90 \/ yr<\/strong>/);
  assert.match(html, /Monthly services \(separate\)<\/span><strong[^>]*>\$34\.10 \/ mo<\/strong>/);
  assert.match(html, /Year 1 annual subscriptions: \$165\.30\. Renewals from Year 2: \$165\.30 \/ year\./);
  assert.match(html, /One-time \+ Year 1 annual total<\/span><strong[^>]*>\$492\.65<\/strong>/);
});

test("real pro forma HTML after bulk pricing hides vendor costs, margins and lock controls", () => {
  const invoice = buildProFormaInvoice(customerOutputAfterBulkPricing());
  assert.deepEqual(invoice.errors, []);
  const html = buildProFormaHtml(invoice);
  assertCustomerPricingPrivacy(html);
  assert.match(html, /PRO FORMA INVOICE/);
  assert.match(html, /Required controller[\s\S]*?\$105\.13/);
  assert.match(html, /Negotiated enclosure[\s\S]*?\$222\.22/);
  assert.match(html, /Included commissioning[\s\S]*?>Included<\/td>/);
});

test("real pro forma HTML excludes all options and discloses monthly and annual renewals separately", () => {
  const invoice = buildProFormaInvoice(customerOutputAfterBulkPricing());
  assert.equal(invoice.optionalExcluded, true);
  assert.equal(invoice.subtotal, 526.75);
  assert.equal(invoice.total, 526.75);
  assert.equal(invoice.monthly, 34.1);
  assert.equal(invoice.annualRenewal, 165.3);
  assert.equal(invoice.lines.some(row => row.description.startsWith("Optional")), false);
  assert.equal(invoice.renewals.some(row => row.description.startsWith("Optional")), false);
  assert.deepEqual(invoice.lines.filter(row => row.billing === "First month").map(row => [row.description, row.amount]), [["Base monitoring", 34.1]]);
  const html = buildProFormaHtml(invoice);
  assert.match(html, /Pro forma total<\/dt><dd>\$526\.75<\/dd>/);
  assert.match(html, /Monthly charges: <strong>\$34\.10 \/ month<\/strong>/);
  assert.match(html, /Annual renewal from Year 2: <strong>\$165\.30 \/ year<\/strong>/);
  assert.match(html, /Optional items are excluded\./);
  assert.match(html, /Future monthly charges and annual renewals are not included in this total\./);
  assert.doesNotMatch(html, /Optional mounting kit|Optional premium monitoring|Optional support renewal|\$44\.53|\$66\.90|\$118\.90/);
});

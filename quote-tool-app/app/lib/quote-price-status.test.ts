import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IliosEstimateDocument } from "../components/ilios-estimate-document";
import { createBlankQuoteRecord } from "./quote-template";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, convertQuickQuoteToMajorProject, ensureMajorProjectState } from "./major-project";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { getAnnualSubscriptionItems } from "./quote-line-billing";
import { getLeasePricingSummary, getProposalOptionCostSummary } from "./proposal-commercial-summary";
import { buildProFormaInvoice } from "./pro-forma";
import { buildProFormaHtml } from "./pro-forma-html";
import { normalizeOrderProcessing } from "./order-processing";
import { fixtureComponent, fixtureQuote } from "../../scripts/quote-master-fixtures";
import { proFormaFixture } from "../../scripts/pro-forma-fixtures";
import type { EquipmentPricingRow, QuotePriceStatus } from "./quote-record";
import { confirmEditedQuotePrice, formatQuoteLinePrice, getQuoteLinePriceProblem, getQuoteLinePriceStatus, getQuotePricingSummary, setQuoteLinePriceStatus } from "./quote-price-status";

const equipment = (price = 0, changes: Partial<EquipmentPricingRow> = {}): EquipmentPricingRow => ({
  id: "radar", itemName: "Radar", sourceType: "custom", quantity: 1, unitPrice: price, totalPrice: price, ...changes,
});
function quick(rows = [equipment()]) {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionC.enabled = false;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = rows;
  return quote;
}
function mapped() {
  const quote = fixtureQuote("RQ-STATUS", "Station", [fixtureComponent("Controller", 500, 100), fixtureComponent("Radar", 0, 75)]);
  const option = quote.majorProject.options[0];
  option.bundles = [{ id: "station", internalName: "Station BOM", customerFacingLabel: "Station", componentIds: ["Controller", "Radar"], includedRevenueComponentIds: ["Controller"], includedCostComponentIds: ["Controller", "Radar"] }];
  option.customerQuoteLines = [{ id: "package", label: "Complete station", bundleIds: ["station"], presentationCategory: "hardware" }];
  return quote;
}

test("legacy nonzero prices and credits are confirmed; zero, unknown and nonfinite prices are TBD", () => {
  assert.equal(getQuoteLinePriceStatus(equipment(75)), "confirmed");
  assert.equal(getQuoteLinePriceStatus(equipment(-25)), "confirmed");
  for (const row of [equipment(), { description: "Unknown" }, { totalPrice: NaN }]) assert.equal(getQuoteLinePriceStatus(row), "tbd");
  assert.equal(formatQuoteLinePrice(equipment(), "$0.00"), "TBD");
  assert.equal(getQuoteLinePriceProblem(equipment(-25)), null);
});

test("status changes do not alter money, quantity, or the original row", () => {
  const row = equipment(125, { quantity: 2, totalPrice: 250 });
  for (const status of ["confirmed", "allowance", "tbd", "included"] as const) {
    const next = setQuoteLinePriceStatus(row, status);
    assert.deepEqual(next, { ...row, priceStatus: status });
    assert.equal(row.priceStatus, undefined);
  }
});

test("a valid deliberate price edit clears stale TBD without confirming other edits", () => {
  const before = equipment(0, { priceStatus: "tbd" });
  assert.equal(confirmEditedQuotePrice(before, { ...before, unitPrice: 40, totalPrice: 40 }).priceStatus, "confirmed");
  const pending = equipment(30, { priceStatus: "tbd" });
  assert.equal(confirmEditedQuotePrice(pending, { ...pending, itemName: "New label" }).priceStatus, "tbd");
  for (const status of ["included", "allowance"] as const) {
    const row = equipment(0, { priceStatus: status });
    assert.equal(confirmEditedQuotePrice(row, { ...row, unitPrice: 40, totalPrice: 40 }).priceStatus, status);
  }
  assert.equal(confirmEditedQuotePrice(pending, { ...pending, unitPrice: 0, totalPrice: 0 }).priceStatus, "tbd");
  assert.equal(confirmEditedQuotePrice(before, { ...before, unitPrice: NaN, totalPrice: NaN }).priceStatus, "tbd");
  assert.equal(confirmEditedQuotePrice(before, { ...before, unitPrice: 40, totalPrice: 0 }).priceStatus, "tbd");
});

test("Included is explicit, allowances are visible, and contradictions require action", () => {
  const included = equipment(0, { priceStatus: "included" });
  assert.equal(formatQuoteLinePrice(included, "$0.00"), "Included");
  assert.equal(getQuotePricingSummary(quick([included])).canExport, true);
  assert.equal(formatQuoteLinePrice(equipment(75, { priceStatus: "allowance" }), "$75.00"), "$75.00 (Allowance)");
  for (const row of [equipment(25, { priceStatus: "included" }), equipment(0, { priceStatus: "confirmed" }), equipment(0, { priceStatus: "allowance" }), equipment(-25, { priceStatus: "allowance" })]) {
    const result = getQuotePricingSummary(quick([row]));
    assert.equal(result.canExport, false);
    assert.equal(result.issues[0].kind, "contradiction");
    assert.match(result.exportErrors[0], /Radar/);
  }
});

test("required counts ignore disabled sections, inactive recurring modes and blank placeholders", () => {
  const quote = quick([equipment(), equipment(0, { id: "blank", itemName: "" })]);
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 1);
  quote.sections.sectionA.poolRows = [{ id: "inactive", description: "Inactive rate", rowType: "service", totalMonthlyRate: 0 }];
  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.perKitRows = [];
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionB.enabled = false;
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 0);
});

test("support descriptions do not imply free; explicit Included support remains valid", () => {
  const quote = quick([]);
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [{ id: "support", rowType: "support", description: "Monitoring", includedText: ["24-hour monitoring"] }];
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 1);
  quote.sections.sectionA.poolRows[0].priceStatus = "included";
  assert.equal(getQuotePricingSummary(quote).canExport, true);
});

test("optional TBD can be quoted clearly but optional contradictory pricing cannot", () => {
  const quote = quick([equipment(0, { optional: true })]);
  const summary = getQuotePricingSummary(quote);
  assert.equal(summary.requiredUnpricedCount, 0);
  assert.equal(summary.optionalUnpricedCount, 1);
  assert.equal(summary.canExport, true);
  const item = getProposalOptionCostSummary(quote).items[0];
  assert.equal(formatQuoteLinePrice(item, "$0.00"), "TBD");
  quote.sections.sectionB.lineItems[0].priceStatus = "confirmed";
  assert.equal(getQuotePricingSummary(quote).canExport, false);
});

test("usage pricing checks the rate, never the usage-dependent total", () => {
  const quote = quick([]);
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [{ id: "usage", rowType: "overage", description: "Additional data", quantity: null, unitPrice: 2, totalMonthlyRate: 0 }];
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  const major = convertQuickQuoteToMajorProject(quote);
  assert.equal(getQuotePricingSummary(major).requiredUnpricedCount, 0);
  quote.sections.sectionA.poolRows[0].unitPrice = 0;
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 1);
  quote.sections.sectionA.poolRows[0].priceStatus = "included";
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  delete quote.sections.sectionA.poolRows[0].priceStatus;
  quote.orderProcessing = normalizeOrderProcessing({ overageOptIn: "no" });
  assert.equal(getQuotePricingSummary(quote).canExport, true);
});

test("a unit rate without a required extended charge cannot export as zero", () => {
  const quote = quick([]);
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [{ id: "missing-total", description: "Data", rowType: "service", monthlyRate: 50, quantity: 2 }];
  assert.equal(getQuotePricingSummary(quote).canExport, false);
  assert.match(getQuotePricingSummary(quote).exportErrors[0], /line total/);
});

test("annual first year inclusion does not lose renewal pricing status", () => {
  const quote = quick([equipment(375, { billing: { cadence: "annual", startsYear: 2 }, priceStatus: "allowance" })]);
  const item = getAnnualSubscriptionItems(quote)[0];
  assert.equal(item.firstYearAmount, 0);
  assert.equal(item.annualAmount, 375);
  assert.equal(item.priceStatus, "allowance");
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  quote.sections.sectionB.lineItems[0] = equipment(0, { billing: { cadence: "annual", startsYear: 2 } });
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 1);
});

test("a mapped zero-price included annual service keeps its cadence and valid backing scope", () => {
  const quote = mapped();
  const option = quote.majorProject.options[0];
  option.components!.forEach(component => {
    component.customerUnitPrice = 0; component.customerExtendedPrice = 0;
    component.vendorUnitCost = 0; component.vendorExtendedCost = 0;
    component.priceStatus = "included"; component.billing = { cadence: "annual", startsYear: 2 };
  });
  option.customerQuoteLines![0].presentationCategory = "recurring";
  const output = applyMajorProjectToQuote(quote);
  const annual = getAnnualSubscriptionItems(output);
  assert.equal(annual.length, 1);
  assert.equal(annual[0].priceStatus, "included");
  assert.equal(annual[0].startsYear, 2);
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  assert.ok(!buildMajorProjectMetrics(quote).validation.issues.some(issue => issue.code === "quote_line_without_backing_economics"));
});

test("mapped credits and optional TBD packages retain valid backing components", () => {
  const quote = mapped();
  quote.majorProject.options[0].components = [fixtureComponent("Controller", -25, 0), fixtureComponent("Radar", 0, 0, { priceStatus: "included" })];
  assert.ok(!buildMajorProjectMetrics(quote).validation.issues.some(issue => issue.code === "quote_line_without_backing_economics"));
  assert.equal(applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0].totalPrice, -25);
  quote.majorProject.options[0].components![0].customerUnitPrice = 0;
  quote.majorProject.options[0].components![0].customerExtendedPrice = 0;
  quote.majorProject.options[0].bundles![0].optional = true;
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  assert.ok(!buildMajorProjectMetrics(quote).validation.issues.some(issue => issue.code === "quote_line_without_backing_economics"));
});

test("metadata round trips across Quick and Major, including invalid values and label overrides", () => {
  const quote = mapped();
  quote.sections.sectionB.lineItems = [equipment(0, { priceStatus: "included" })];
  const option = quote.majorProject.options[0];
  option.components![1].priceStatus = "included";
  option.components![1].customerLabelOverride = true;
  option.bundles![0].priceStatus = "allowance";
  option.bundles![0].customerLabelOverride = true;
  option.customerQuoteLines![0].priceStatus = "allowance";
  option.simpleRows = [{ id: "simple", label: "Simple", quantity: 1, customerUnitPrice: 20, customerExtendedPrice: 20, ourUnitCost: 10, ourExtendedCost: 10, bucket: "hardware", priceStatus: "allowance" }];
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.equal(restored.sections.sectionB.lineItems[0].priceStatus, "included");
  assert.equal(restored.majorProject.options[0].components![1].priceStatus, "included");
  assert.equal(restored.majorProject.options[0].components![1].customerLabelOverride, true);
  assert.equal(restored.majorProject.options[0].bundles![0].customerLabelOverride, true);
  assert.equal(restored.majorProject.options[0].simpleRows![0].priceStatus, "allowance");
  assert.equal(buildMajorProjectMetrics(restored).customerQuoteLines[0].priceStatus, "allowance");
  quote.sections.sectionB.lineItems[0].priceStatus = "invalid" as QuotePriceStatus;
  assert.equal(deserializeQuoteRecord(serializeQuoteRecord(quote))!.sections.sectionB.lineItems[0].priceStatus, "tbd");
});

test("mapped hidden cost-only components block pricing until explicitly Included", () => {
  const quote = mapped();
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 1);
  assert.match(getQuotePricingSummary(quote).exportErrors[0], /Radar/);
  assert.equal(applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0].priceStatus, "tbd");
  quote.majorProject.options[0].bundles![0].priceStatus = "confirmed";
  assert.equal(getQuotePricingSummary(quote).canExport, false);
  quote.majorProject.options[0].components![1].priceStatus = "included";
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  assert.equal(applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0].priceStatus, "confirmed");
});

test("direct zero lines, credits and unpriced monthly services remain in output", () => {
  const quote = fixtureQuote("RQ-DIRECT", "Direct", [fixtureComponent("Radar", 0, 100), fixtureComponent("Credit", -20, 0), fixtureComponent("Data", 0, 0, { schedule: "recurring" })]);
  const output = applyMajorProjectToQuote(quote);
  assert.equal(output.sections.sectionB.lineItems.length, 2);
  assert.equal(output.sections.sectionB.lineItems[1].totalPrice, -20);
  assert.equal(output.sections.sectionA.enabled, true);
  assert.equal(output.sections.sectionA.perKitRows[0].description, "Data");
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 2);
});

test("simple rows carry statuses through component mapping; blank rows do not become required packages", () => {
  const quote = fixtureQuote("RQ-SIMPLE", "Simple", []);
  quote.majorProject.options[0].simpleRows = [
    { id: "included", label: "Mount", quantity: 1, customerUnitPrice: 0, customerExtendedPrice: 0, ourUnitCost: 5, ourExtendedCost: 5, bucket: "hardware", priceStatus: "included" },
    { id: "blank", label: "", quantity: 1, customerUnitPrice: 0, customerExtendedPrice: 0, ourUnitCost: 0, ourExtendedCost: 0, bucket: "hardware" },
  ];
  const normalized = ensureMajorProjectState(quote);
  assert.equal(normalized.majorProject.options[0].components?.length, 1);
  assert.equal(normalized.majorProject.options[0].components![0].priceStatus, "included");
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  assert.equal(applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0].priceStatus, "included");
});

test("mapped optional bundles keep TBD visible and inactive options are not counted", () => {
  const quote = mapped();
  quote.majorProject.options[0].bundles![0].optional = true;
  quote.majorProject.options.push({ ...structuredClone(quote.majorProject.options[0]), id: "inactive" });
  const summary = getQuotePricingSummary(quote);
  assert.equal(summary.requiredUnpricedCount, 0);
  assert.equal(summary.optionalUnpricedCount, 1);
  assert.equal(summary.canExport, true);
  assert.equal(getProposalOptionCostSummary(applyMajorProjectToQuote(quote)).items[0].priceStatus, "tbd");
});

test("an explicit Included parent cannot conceal a paid child or unresolved component", () => {
  const quote = mapped();
  quote.majorProject.options[0].components![1].priceStatus = "included";
  quote.majorProject.options[0].bundles![0].priceStatus = "included";
  const summary = getQuotePricingSummary(quote);
  assert.equal(summary.canExport, false);
  assert.ok(summary.issues.some(issue => issue.location.endsWith("Bundles") && issue.kind === "contradiction"));
  const row = applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0];
  assert.notEqual(formatQuoteLinePrice(row, "$500.00"), "Included");
  quote.majorProject.options[0].bundles![0].optional = true;
  assert.equal(getQuotePricingSummary(quote).canExport, false);
});

test("separate mapped monthly statuses survive output without changing the confirmed legacy rollup", () => {
  const quote = mapped();
  const option = quote.majorProject.options[0];
  option.components!.forEach(component => { component.schedule = "recurring"; component.billing = { cadence: "monthly" }; });
  option.customerQuoteLines![0].presentationCategory = "recurring";
  let output = applyMajorProjectToQuote(quote);
  assert.equal(output.sections.sectionA.perKitRows[0].id, "package");
  assert.equal(output.sections.sectionA.perKitRows[0].priceStatus, "tbd");
  option.components![1].priceStatus = "included";
  output = applyMajorProjectToQuote(quote);
  assert.equal(output.sections.sectionA.perKitRows[0].id, "major_recurring");
  assert.equal(output.sections.sectionA.perKitRows[0].totalMonthlyRate, 500);
  assert.equal(getQuotePricingSummary(quote).canExport, true);
});

test("Quick to Major retains metadata and genuine aggregate cost rows do not become free customer items", () => {
  const quote = quick([equipment(50, { priceStatus: "allowance" })]);
  quote.commercial.costs.oneTimeEquipmentCost = 25;
  const major = convertQuickQuoteToMajorProject(quote);
  const output = applyMajorProjectToQuote(major);
  assert.equal(getQuotePricingSummary(major).canExport, true);
  assert.equal(output.sections.sectionB.lineItems.length, 1);
  assert.equal(output.sections.sectionB.lineItems[0].priceStatus, "allowance");
  assert.equal(output.commercial.costs.oneTimeEquipmentCost, 25);
});

test("lease calculations are untouched, but a cost basis cannot hide unpriced equipment", () => {
  const quote = quick([equipment(1000)]);
  quote.metadata.quoteType = "lease";
  quote.metadata.hasActiveDataAgreement = true;
  quote.commercial.costs.oneTimeEquipmentCost = 600;
  const before = getLeasePricingSummary(quote);
  quote.sections.sectionB.lineItems[0] = setQuoteLinePriceStatus(quote.sections.sectionB.lineItems[0], "allowance");
  assert.deepEqual(getLeasePricingSummary(quote), before);
  assert.equal(getQuotePricingSummary(quote).canExport, true);
  quote.sections.sectionB.lineItems[0] = equipment();
  assert.equal(getQuotePricingSummary(quote).requiredUnpricedCount, 1);
  assert.ok(buildProFormaInvoice(quote).errors.some(message => message.includes("Radar")));
});

test("pro forma HTML visibly distinguishes allowance and Included, including renewal prices", () => {
  const quote = proFormaFixture();
  quote.sections.sectionB.lineItems[0].priceStatus = "allowance";
  quote.sections.sectionB.lineItems[2].priceStatus = "allowance";
  quote.sections.sectionC.lineItems.push({ id: "included", sourceType: "custom", description: "Included configuration", quantity: 1, unitPrice: 0, totalPrice: 0, priceStatus: "included" });
  const invoice = buildProFormaInvoice(quote);
  const html = buildProFormaHtml(invoice);
  assert.match(html, /\$1,000\.00 \(Allowance\)/);
  assert.match(html, /\$375\.00 \(Allowance\)/);
  assert.match(html, /Included configuration[\s\S]*?>Included<\/td>/);
  assert.doesNotMatch(html, /Pricing needs review/);
});

test("customer estimate output labels required zero items and optional TBD without hiding either", () => {
  const quote = quick([
    equipment(), equipment(0, { id: "included", itemName: "Included mount", priceStatus: "included" }),
    equipment(75, { id: "allowance", itemName: "Shipping allowance", priceStatus: "allowance" }),
    equipment(0, { id: "option", itemName: "Optional controller", optional: true }),
  ]);
  quote.metadata.companyKey = "ilios";
  quote.metadata.outputTemplateKey = "estimate_compact";
  const html = renderToStaticMarkup(createElement(IliosEstimateDocument, { quote }));
  assert.match(html, /Draft pricing is incomplete/);
  assert.match(html, /Radar[\s\S]*?TBD/);
  assert.match(html, /Included mount[\s\S]*?>Included<\/td>/);
  assert.match(html, /Shipping allowance[\s\S]*?\$75\.00 \(Allowance\)/);
  assert.match(html, /Optional controller[\s\S]*?TBD/);
});

test("server proposal and pro forma exports reject required unresolved pricing before rendering", async () => {
  const quote = proFormaFixture();
  quote.sections.sectionB.lineItems[0] = equipment();
  const proposal = await import("../api/proposal-pdf/route");
  const invoice = await import("../api/pro-forma-pdf/route");
  for (const POST of [proposal.POST, invoice.POST]) {
    const response = await POST(new Request("http://localhost/api/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote }) }));
    assert.equal(response.status, 422);
    assert.match(JSON.stringify(await response.json()), /Radar/);
  }
});

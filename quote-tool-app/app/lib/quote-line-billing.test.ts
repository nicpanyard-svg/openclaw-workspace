import assert from "node:assert/strict";
import test from "node:test";
import { getAnnualSubscriptionItems, getAnnualSubscriptionSummary, getLineBilling } from "./quote-line-billing";
import { getCombinedOneTimeTotal, getEquipmentTotal, getLeasePricingSummary, getProposalOptionCostSummary, getRecurringMonthlyTotal, getQuoteContentPresence } from "./proposal-commercial-summary";
import { applyMajorProjectToQuote, buildMajorProjectMetrics } from "./major-project";
import { buildCommercialMetrics } from "./commercial-model";
import { buildOrderProcessingText } from "./order-processing";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { createBlankQuoteRecord } from "./quote-template";
import type { MajorProjectComponent, QuoteRecord } from "./quote-record";
import { getProposalAttachments } from "./proposal-attachments";
import { buildEstimateTemplateModel } from "./estimate-template";

function vendorQuote() {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionC.enabled = false;
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    ["CamLevel-Edge perpetual license", 3750, false],
    ["CamLevel site calibration and training", 1350, false],
    ["CamFlood-Edge perpetual license", 3750, false],
    ["CamFlood site calibration and training", 1350, false],
    ["OS\u2022Board", 1350, false],
    ["AXIS Camera Station Cloud Storage", 125, false],
    ["CamLevel-Edge Serenity Plan", 375, true],
    ["CamFlood-Edge Serenity Plan", 375, true],
  ].map(([label, rate, optional], index) => ({
    id: `vendor-${index}`, sourceType: "custom", itemName: String(label),
    description: index === 4 ? "LOCAL $1,350/year; MIX $3,500/year; GLOBAL $9,000/year" : "First-year Serenity included with perpetual license; annual renewal available.",
    quantity: index === 5 ? 2 : 1, unitPrice: Number(rate), totalPrice: Number(rate) * (index === 5 ? 2 : 1), optional: Boolean(optional),
  }));
  return quote;
}

function majorQuote(mapped = false) {
  const quote = vendorQuote();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  const option = quote.majorProject.options[0];
  quote.majorProject.activeOptionId = option.id;
  quote.majorProject.commercial.termMonths = 24;
  quote.majorProject.commercial.terminalFeePerSite = 0;
  quote.majorProject.commercial.overageRatePerGb = 0;
  option.simpleRows = [];
  option.components = quote.sections.sectionB.lineItems.map((row) => ({
    id: row.id, internalName: row.itemName, customerFacingLabel: row.itemName, optional: row.optional,
    vendor: row.itemName.startsWith("AXIS") ? "AXIS" : "TENEViA", category: "Software", lineType: "software",
    quantity: row.quantity, unit: "application", customerUnitPrice: row.unitPrice, customerExtendedPrice: row.totalPrice,
    vendorUnitCost: row.unitPrice / 2, vendorExtendedCost: row.totalPrice / 2, schedule: "one_time", notes: row.description,
    costBasis: "estimate", resaleBasis: "fixed_fee", passThrough: false,
  } satisfies MajorProjectComponent));
  option.bundles = mapped ? option.components.map((component) => ({
    id: `bundle-${component.id}`, internalName: component.internalName, customerFacingLabel: component.internalName,
    description: component.notes || "", componentIds: [component.id], optional: component.optional,
  })) : [];
  option.customerQuoteLines = mapped ? option.components.map((component) => ({
    id: `line-${component.id}`, label: component.internalName, description: component.notes,
    optional: component.optional, bundleIds: [`bundle-${component.id}`], includedRevenueComponentIds: [component.id], includedCostComponentIds: [component.id],
    schedule: "one_time", presentationCategory: "hardware",
  })) : [];
  return quote;
}

function verifyVendorTotals(quote: QuoteRecord) {
  assert.equal(getCombinedOneTimeTotal(quote), 10200);
  assert.equal(getRecurringMonthlyTotal(quote), 0);
  const annual = getAnnualSubscriptionSummary(quote);
  assert.equal(annual.firstYearTotal, 1600);
  assert.equal(annual.renewalTotal, 1600);
  assert.equal(annual.firstYearTotal + getCombinedOneTimeTotal(quote), 11800);
  assert.equal(annual.items.find((item) => item.label.startsWith("AXIS"))?.quantity, 2);
  assert.equal(annual.items.find((item) => item.label.startsWith("AXIS"))?.unitPrice, 125);
  const options = getProposalOptionCostSummary(quote);
  assert.equal(options.oneTimeTotal, 0);
  assert.equal(options.monthlyTotal, 0);
  assert.equal(options.annualTotal, 750);
  assert.ok(options.items.every((item) => item.cadence === "annual" && item.startsYear === 2 && item.unitLabel === "application"));
}

test("legacy vendor pricing preserves selected rates and separates annual subscriptions", () => verifyVendorTotals(vendorQuote()));
test("billing is explicit per item and does not guess from descriptive license prose", () => {
  assert.equal(getLineBilling({ itemName: "Perpetual license", description: "Annual support included" }).cadence, "one_time");
  assert.equal(getLineBilling({ itemName: "OS Board", billing: { cadence: "one_time" } }).cadence, "one_time");
  assert.equal(getLineBilling({ itemName: "Different vendor subscription", billing: { cadence: "annual" } }).cadence, "annual");
});
test("saved quick quote retains annual timing and optional renewal amounts", () => {
  const quote = vendorQuote();
  quote.sections.sectionB.lineItems[0].billing = { cadence: "one_time" };
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote));
  assert.ok(restored);
  verifyVendorTotals(restored);
});
for (const mapped of [false, true]) test(`Major Quote ${mapped ? "mapped" : "direct"} output and contract economics preserve annual billing`, () => {
  const source = majorQuote(mapped);
  const metrics = buildMajorProjectMetrics(source);
  assert.equal(metrics.validation.errorCount, 0, JSON.stringify(metrics.validation.issues));
  assert.equal(metrics.oneTimeRevenue, 10200);
  assert.equal(metrics.recurringRevenue, 0);
  assert.equal(metrics.annualRevenue, 1600);
  assert.equal(metrics.annualContractRevenue, 3200);
  assert.equal(metrics.totalContractRevenue, 13400);
  assert.equal(metrics.totalContractCost, 6700);
  const quote = applyMajorProjectToQuote(source);
  verifyVendorTotals(quote);
  assert.equal(quote.commercial.costs.annualSubscriptionCost, 800);
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote));
  assert.ok(restored);
  verifyVendorTotals(applyMajorProjectToQuote(restored));
});
test("one quote can combine different vendors and monthly, one-time, and annual billing", () => {
  const quote = vendorQuote();
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "monthly", rowType: "service", description: "Monthly connectivity", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 },
    { id: "annual", rowType: "service", description: "Vendor annual monitoring", quantity: 2, monthlyRate: 60, totalMonthlyRate: 120, billing: { cadence: "annual" } },
    { id: "overage", rowType: "overage", description: "Usage", totalMonthlyRate: 3, billing: { cadence: "annual" } },
  ];
  assert.equal(getRecurringMonthlyTotal(quote), 100);
  assert.equal(getAnnualSubscriptionSummary(quote).firstYearTotal, 1720);
  assert.equal(getCombinedOneTimeTotal(quote), 10200);
  quote.sections.sectionB.enabled = false;
  assert.equal(getAnnualSubscriptionSummary(quote).firstYearTotal, 120);
  assert.equal(getProposalOptionCostSummary(quote).annualTotal, 0);
});
test("included first-year renewal has no Year 1 charge and stays out of lease equipment", () => {
  const quote = vendorQuote();
  quote.sections.sectionB.lineItems = [{ id: "renewal", sourceType: "custom", itemName: "Annual support", quantity: 1, unitPrice: 375, totalPrice: 375, billing: { cadence: "annual", startsYear: 2 } }];
  quote.metadata.quoteType = "lease";
  quote.metadata.hasActiveDataAgreement = true;
  quote.commercial.costs.oneTimeEquipmentCost = 200;
  assert.equal(getEquipmentTotal(quote), 0);
  assert.equal(getLeasePricingSummary(quote).hardwareMonthly, 0);
  assert.equal(getAnnualSubscriptionSummary(quote).firstYearTotal, 0);
  assert.equal(getAnnualSubscriptionSummary(quote).renewalTotal, 375);
  assert.equal(getQuoteContentPresence(quote).hasAnnualContent, true);
});
test("annual values remain visible in internal handoff and commercial totals", () => {
  const quote = vendorQuote();
  const output = buildOrderProcessingText(quote);
  assert.match(output, /Year 1 prepaid annual subscriptions: \$1,600.00/);
  assert.match(output, /Excluded optional annual total: \$750.00\/year/);
  const metrics = buildCommercialMetrics(quote);
  assert.equal(metrics.oneTimeRevenue, 10200);
  assert.equal(metrics.annualRevenue, 1600);
  assert.equal(metrics.totalRevenue, 11800);
});
test("Major Quote blocks mixed annual terms inside one customer bundle", () => {
  const quote = majorQuote(true);
  const option = quote.majorProject.options[0];
  option.customerQuoteLines = [{ ...option.customerQuoteLines![0], includedRevenueComponentIds: option.components!.map((component) => component.id), includedCostComponentIds: option.components!.map((component) => component.id) }];
  assert.ok(buildMajorProjectMetrics(quote).validation.issues.some((issue) => issue.code === "mixed_annual_billing" && issue.severity === "error"));
});
test("deferred annual renewals bill once during a 24-month Major Quote", () => {
  const quote = majorQuote();
  const option = quote.majorProject.options[0];
  option.components = [option.components![6]];
  option.components[0].optional = false;
  const metrics = buildMajorProjectMetrics(quote);
  assert.equal(metrics.annualRevenue, 0);
  assert.equal(metrics.annualContractRevenue, 375);
  assert.equal(getAnnualSubscriptionItems(applyMajorProjectToQuote(quote))[0].startsYear, 2);
});

test("annual specs follow one-time scope and keep multiple annual lines formerly categorized recurring", () => {
  const quote = majorQuote(true);
  const option = quote.majorProject.options[0];
  for (const index of [0, 4, 5]) {
    const line = option.customerQuoteLines![index];
    line.specSheetAttachment = { storageKey: `spec-${index}`, fileName: `spec-${index}.pdf`, mimeType: "application/pdf", sizeBytes: 100, updatedAt: "2026-09-06T00:00:00.000Z" };
    if (index > 0) line.presentationCategory = "recurring";
  }
  const output = applyMajorProjectToQuote(quote);
  assert.deepEqual(getProposalAttachments(output).map((entry) => entry.attachment.storageKey), ["spec-0", "spec-4", "spec-5"]);
});

test("annual-only Ilios estimates retain annual scope and optional totals", () => {
  const quote = vendorQuote();
  quote.metadata.outputTemplateKey = "estimate_compact";
  quote.metadata.companyKey = "ilios";
  const model = buildEstimateTemplateModel(quote);
  assert.ok(model);
  assert.equal(model.annual.firstYearTotal, 1600);
  assert.equal(model.optionCostAnnualTotal, 750);
  assert.equal(model.subtotal, 11800);
});

test("mixed-billing approval workbook has separate annual and optional schedules", async () => {
  const { buildProposalApprovalWorkbook } = await import("./proposal-xlsx-export");
  const exceljs = await import("exceljs");
  const result = await buildProposalApprovalWorkbook(vendorQuote());
  const workbook = new (exceljs.default ?? exceljs).Workbook();
  await workbook.xlsx.load(await result.blob.arrayBuffer());
  const summary = workbook.getWorksheet("Billing Summary")!;
  assert.equal(summary.getCell("B5").value, 10200);
  assert.equal(summary.getCell("B7").value, 1600);
  assert.equal(summary.getCell("B9").value, 11800);
  assert.equal(summary.getCell("B12").value, 750);
  const optional = workbook.getWorksheet("Option Costs")!;
  assert.equal(optional.getCell("B2").value, "Annual renewal from Year 2");
  assert.equal(optional.getCell("F2").value, 375);
  assert.equal(optional.getCell("G2").value, "No");
});

test("PDF endpoint rejects a customer line hiding different annual billing terms", async () => {
  const { POST } = await import("../api/proposal-pdf/route");
  const quote = majorQuote(true);
  const option = quote.majorProject.options[0];
  option.customerQuoteLines![0].includedRevenueComponentIds = [option.components![0].id, option.components![4].id];
  const response = await POST(new Request("http://localhost:3017/api/proposal-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /distinct customer quote lines/);
});

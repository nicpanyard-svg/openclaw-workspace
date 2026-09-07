import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import { applyMajorProjectToQuote } from "./major-project";
import { customerGroupKey, getWorkspaceQuoteSummary } from "./workspace-quote-summary";
import { canSplitQuoteMasterConnectivity } from "./quote-master-model";
import { quoteMasterFixtures } from "../../scripts/quote-master-fixtures";

function quickQuote() {
  const quote = createBlankQuoteRecord();
  quote.metadata.quoteType = "purchase";
  quote.metadata.salesTaxAmount = 20;
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.perKitRows = [
    { id: "service", rowType: "service", description: "Data", quantity: 1, totalMonthlyRate: 100 },
    { id: "overage", rowType: "overage", description: "Usage", quantity: 1, totalMonthlyRate: 900 },
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "hardware", sourceType: "custom", itemName: "Gateway", quantity: 1, unitPrice: 650, totalPrice: 650 }];
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    { id: "install", sourceType: "custom", description: "Install", quantity: 1, unitPrice: 50, totalPrice: 50 },
    { id: "option", sourceType: "custom", description: "Optional install", quantity: 1, unitPrice: 25, totalPrice: 25, optional: true },
    { id: "annual", sourceType: "custom", description: "Annual license", quantity: 1, unitPrice: 1200, totalPrice: 1200, billing: { cadence: "annual" } },
    { id: "renewal", sourceType: "custom", description: "Year 2 renewal", quantity: 1, unitPrice: 300, totalPrice: 300, billing: { cadence: "annual", startsYear: 2 } },
  ];
  return quote;
}

test("Workspace uses customer one-time total including installation and tax, not optional services", () => {
  const quote = quickQuote(), before = structuredClone(quote), totals = getWorkspaceQuoteSummary(quote);
  assert.equal(totals.oneTime, 720);
  assert.equal(totals.monthly, 100);
  assert.equal(totals.annualFirstYear, 1200);
  assert.equal(totals.annualRenewal, 1500);
  assert.equal(totals.options.oneTimeTotal, 25);
  assert.deepEqual(quote, before);
});

test("Workspace lease total includes hardware but does not double charge upfront", () => {
  const quote = quickQuote();
  quote.metadata.quoteType = "lease";
  quote.metadata.leaseTermMonths = 3;
  quote.metadata.leaseMarginPercent = 35;
  quote.metadata.hasActiveDataAgreement = false;
  quote.commercial.costs.oneTimeEquipmentCost = 650;
  assert.equal(getWorkspaceQuoteSummary(quote).monthly, null);
  quote.metadata.hasActiveDataAgreement = true;
  const totals = getWorkspaceQuoteSummary(quote);
  assert.equal(totals.monthly, 433.33);
  assert.equal(totals.oneTime, 70);
});

test("disabled sections do not contribute Workspace totals", () => {
  const quote = quickQuote();
  quote.sections.sectionA.enabled = false;
  quote.sections.sectionB.enabled = false;
  quote.sections.sectionC.enabled = false;
  const totals = getWorkspaceQuoteSummary(quote);
  assert.equal(totals.oneTime, 20);
  assert.equal(totals.monthly, 0);
  assert.equal(totals.annualFirstYear, 0);
  assert.equal(totals.options.items.length, 0);
});

test("Major Project summaries preserve separate annual, monthly and option costs", () => {
  const totals = quoteMasterFixtures().map(({ quote }) => getWorkspaceQuoteSummary(applyMajorProjectToQuote(quote)));
  assert.equal(totals[0].oneTime, 11944.46);
  assert.equal(totals[1].oneTime, 9660.76);
  assert.equal(totals[2].oneTime, 10200);
  assert.equal(totals[2].annualFirstYear, 1600);
  assert.equal(totals[2].options.annualTotal, 750);
  assert.equal(totals[3].monthly, 92.5);
});

test("only eligible service alternatives expose the connectivity split", () => {
  const choices = quoteMasterFixtures(), before = structuredClone(choices);
  assert.deepEqual(choices.map(canSplitQuoteMasterConnectivity), [false, false, false, true]);
  assert.deepEqual(choices, before);
});

test("customer grouping is case- and whitespace-insensitive", () => {
  assert.equal(customerGroupKey(" San Antonio River Authority "), customerGroupKey("san antonio river authority"));
});

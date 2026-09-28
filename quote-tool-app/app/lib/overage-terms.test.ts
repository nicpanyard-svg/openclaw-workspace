import assert from "node:assert/strict";
import test from "node:test";
import { getOverageDefault, getOveragePlan, isOverageBasisCompatible, resolveOverageTerms, setOveragePrice } from "./overage-terms";
import { createBlankQuoteRecord } from "./quote-template";
import { getOrderProcessing } from "./order-processing";
import { applyMajorProjectToQuote, convertQuickQuoteToMajorProject, getActiveMajorProjectOption } from "./major-project";
import { getRecurringMonthlyTotal } from "./proposal-commercial-summary";

function quoteWithLegacyRate(amount = 0.55) {
  const quote = createBlankQuoteRecord();
  quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn: "yes" };
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "data", rowType: "service", description: "Data", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 },
    { id: "usage", rowType: "overage", description: "Overages", monthlyRate: amount, unitPrice: amount, unitLabel: "GB", totalMonthlyRate: amount },
  ];
  return quote;
}

test("resolution never invents an election or sheet rate and requires an explicit yes or no", () => {
  const quote = createBlankQuoteRecord();
  assert.deepEqual(resolveOverageTerms(quote), { decision: "pending", amount: null, basis: "", conflict: false, planMismatch: false });
  for (const choice of ["pending", "not_applicable", "unknown", true, undefined]) {
    quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn: choice as never };
    assert.equal(resolveOverageTerms(quote).decision, "pending");
  }
});

test("legacy rates use only included active enabled rows and their unit rate", () => {
  const quote = quoteWithLegacyRate(0.27);
  quote.sections.sectionA.poolRows[1].totalMonthlyRate = 900;
  const before = structuredClone(quote);
  assert.deepEqual(resolveOverageTerms(quote), { decision: "yes", amount: 0.27, basis: "per GB", conflict: false, planMismatch: false });
  assert.deepEqual(quote, before);
  quote.sections.sectionA.poolRows[1].optional = true;
  assert.equal(resolveOverageTerms(quote).amount, null);
  quote.sections.sectionA.poolRows[1].optional = false;
  quote.sections.sectionA.enabled = false;
  assert.equal(resolveOverageTerms(quote).amount, null);
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "per_kit";
  assert.equal(resolveOverageTerms(quote).amount, null);
});

test("valid structured rates are retained and equivalent legacy basis does not conflict", () => {
  const quote = quoteWithLegacyRate(0.31);
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: 0.31, basis: " PER gb " };
  assert.deepEqual(resolveOverageTerms(quote), { decision: "yes", amount: 0.31, basis: "per GB", conflict: false, planMismatch: false });
  quote.sections.sectionA.poolRows[1].monthlyRate = 0.55;
  assert.deepEqual(resolveOverageTerms(quote), { decision: "yes", amount: 0.31, basis: "per GB", conflict: true, planMismatch: false });
  assert.equal(quote.sections.sectionA.poolRows[1].monthlyRate, 0.55);
});

test("multiple distinct legacy rates require a choice rather than silently choosing one", () => {
  const quote = quoteWithLegacyRate(0.31);
  quote.sections.sectionA.poolRows.push({ ...quote.sections.sectionA.poolRows[1], id: "usage2", monthlyRate: 0.62 });
  assert.deepEqual(resolveOverageTerms(quote), { decision: "yes", amount: null, basis: "per GB", conflict: true, planMismatch: false });
  quote.sections.sectionA.poolRows[2].monthlyRate = 0.31;
  assert.equal(resolveOverageTerms(quote).amount, 0.31);
  assert.equal(resolveOverageTerms(quote).conflict, false);
});

test("zero is a valid explicit rate while malformed amount or blank basis is not", () => {
  const quote = quoteWithLegacyRate();
  quote.sections.sectionA.poolRows = [];
  for (const amount of [null, -1, Infinity, NaN]) {
    quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount, basis: "per GB" };
    assert.equal(resolveOverageTerms(quote).amount, null);
  }
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: 0, basis: "per GB" };
  assert.equal(resolveOverageTerms(quote).amount, 0);
  for (const status of ["pending", "included", "not_applicable"] as const) {
    quote.orderProcessing!.requirements!.rates.overages.status = status;
    assert.equal(resolveOverageTerms(quote).amount, null);
  }
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: 0.55, basis: " " };
  assert.equal(resolveOverageTerms(quote).amount, 0.55);
  assert.equal(resolveOverageTerms(quote).basis, "");
});

test("a cleared explicit price or basis never falls back to a saved legacy row", () => {
  const quote = quoteWithLegacyRate();
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: null, basis: "per GB" };
  assert.equal(resolveOverageTerms(quote).amount, null);
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: 0.44, basis: "" };
  assert.equal(resolveOverageTerms(quote).amount, 0.44);
  assert.equal(resolveOverageTerms(quote).basis, "");
  quote.sections.sectionA.poolRows[1].monthlyRate = -1;
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: 0.44, basis: "per GB" };
  assert.equal(resolveOverageTerms(quote).conflict, false, "invalid old line values cannot replace an explicit valid rate");
});

test("setting a rate resolves conflicts immutably and keeps usage out of totals", () => {
  const quote = quoteWithLegacyRate(0.31);
  quote.sections.sectionA.poolRows.push({ ...quote.sections.sectionA.poolRows[1], id: "optional", optional: true, monthlyRate: 4 });
  const before = structuredClone(quote);
  const changed = setOveragePrice(quote, 0.47);
  assert.deepEqual(quote, before);
  assert.deepEqual(resolveOverageTerms(changed), { decision: "yes", amount: 0.47, basis: "per GB", conflict: false, planMismatch: false });
  assert.equal(changed.sections.sectionA.poolRows[1].unitPrice, 0.47);
  assert.equal(changed.sections.sectionA.poolRows[1].monthlyRate, 0.47);
  assert.equal(changed.sections.sectionA.poolRows[1].totalMonthlyRate, 0);
  assert.equal(changed.sections.sectionA.poolRows[2].monthlyRate, 4);
  assert.equal(getRecurringMonthlyTotal(changed), 100);
  const cleared = setOveragePrice(changed, null);
  assert.equal(resolveOverageTerms(cleared).amount, null);
  changed.orderProcessing!.overageOptIn = "no";
  assert.equal(resolveOverageTerms(changed).amount, 0.47);
});

test("converted Major Project edits survive regeneration through components and source rows", () => {
  const original = convertQuickQuoteToMajorProject(quoteWithLegacyRate(0.31));
  const before = structuredClone(original);
  const changed = setOveragePrice(original, 0.48);
  assert.deepEqual(original, before);
  const option = getActiveMajorProjectOption(changed)!;
  const usage = option.components!.find(component => component.quickQuoteSource?.usageBased)!;
  assert.equal(usage.customerUnitPrice, 0.48);
  assert.equal(usage.customerExtendedPrice, 0);
  assert.equal(option.quickQuoteSource!.sections.sectionA.poolRows[1].monthlyRate, 0.48);
  assert.equal(option.quickQuoteSource!.sections.sectionA.poolRows[1].totalMonthlyRate, 0);
  const regenerated = applyMajorProjectToQuote(changed);
  assert.deepEqual(resolveOverageTerms(regenerated), { decision: "yes", amount: 0.48, basis: "per GB", conflict: false, planMismatch: false });
  assert.equal(getRecurringMonthlyTotal(regenerated), 100);
  const cleared = applyMajorProjectToQuote(setOveragePrice(changed, null));
  assert.equal(resolveOverageTerms(cleared).amount, null);
  const noBasis = applyMajorProjectToQuote(setOveragePrice(changed, 0.48, ""));
  assert.equal(resolveOverageTerms(noBasis).amount, 0.48);
  assert.equal(resolveOverageTerms(noBasis).basis, "");
});

test("native Major Project edits synchronize the generated commercial rate", () => {
  const quote = quoteWithLegacyRate();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  quote.majorProject.commercial.serviceMix = "starlink-pool";
  const changed = applyMajorProjectToQuote(setOveragePrice(quote, 0.42));
  assert.equal(changed.majorProject.commercial.overageRatePerGb, 0.42);
  assert.equal(resolveOverageTerms(changed).amount, 0.42);
  assert.equal(resolveOverageTerms(changed).conflict, false);
});

test("plan defaults follow explicit noncorporate pricing before actual service layout", () => {
  const quote = quoteWithLegacyRate();
  assert.equal(getOveragePlan(quote), "pool");
  assert.deepEqual(getOverageDefault(quote), { amount: 0.55, basis: "per GB" });
  quote.sections.sectionA.mode = "per_kit";
  assert.equal(getOveragePlan(quote), "blocks");
  assert.deepEqual(getOverageDefault(quote), { amount: 32.5, basis: "per 50GB block" });
  quote.orderProcessing!.requirements!.corporatePricing = "no";
  quote.orderProcessing!.requirements!.pricingStructure = "pool";
  assert.equal(getOveragePlan(quote), "pool", "the chosen pool plan wins over monthly row layout");
  quote.sections.sectionA.mode = "pool";
  quote.orderProcessing!.requirements!.pricingStructure = "individual";
  assert.equal(getOveragePlan(quote), "blocks");
  quote.orderProcessing!.requirements!.corporatePricing = "yes";
  assert.equal(getOveragePlan(quote), "pool", "corporate plans use the actual active service mode");
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  quote.majorProject.commercial.serviceMix = "starlink-per-site";
  assert.equal(getOveragePlan(quote), "blocks", "Major's current commercial inputs win over unregenerated output rows");
});

test("block-plan legacy per-GB rates are preserved and flagged until explicitly corrected", () => {
  const quote = quoteWithLegacyRate(0.47);
  quote.orderProcessing!.requirements!.corporatePricing = "no";
  quote.orderProcessing!.requirements!.pricingStructure = "individual";
  assert.deepEqual(resolveOverageTerms(quote), { decision: "yes", amount: 0.47, basis: "per GB", conflict: false, planMismatch: true });
  assert.equal(isOverageBasisCompatible(quote, "per 50 GB block"), true);
  assert.equal(isOverageBasisCompatible(quote, "GB"), false);
  const standard = getOverageDefault(quote);
  const changed = setOveragePrice(quote, standard.amount, standard.basis);
  assert.deepEqual(resolveOverageTerms(changed), { decision: "yes", amount: 32.5, basis: "per 50GB block", conflict: false, planMismatch: false });
  assert.equal(quote.sections.sectionA.poolRows[1].monthlyRate, 0.47);
  assert.equal(changed.sections.sectionA.poolRows[1].unitLabel, "50GB block");
  const edited = setOveragePrice(changed, 37.25);
  assert.equal(resolveOverageTerms(edited).amount, 37.25);
  assert.equal(resolveOverageTerms(edited).basis, "per 50GB block");
  assert.equal(getRecurringMonthlyTotal(edited), 100);
  edited.orderProcessing!.requirements!.pricingStructure = "pool";
  assert.equal(resolveOverageTerms(edited).amount, 37.25, "plan changes never reinterpret or replace a saved rate");
  assert.equal(resolveOverageTerms(edited).planMismatch, true);
});

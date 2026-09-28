import assert from "node:assert/strict";
import test from "node:test";
import { buildCommercialMetrics } from "./commercial-model";
import { convertQuickQuoteToMajorProject } from "./major-project";
import { createBlankQuoteRecord } from "./quote-template";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";

function quoteWithOverage() {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "plan", rowType: "service", description: "Data plan", quantity: 2, monthlyRate: 100, totalMonthlyRate: 200 },
    { id: "overage", rowType: "overage", description: "Overages", quantity: null, unitLabel: "GB", monthlyRate: 0.55, totalMonthlyRate: 0.55 },
  ];
  quote.commercial.costs.recurringVendorCost = 80;
  return quote;
}

test("internal revenue and profit exclude a saved legacy overage total without losing the rate", () => {
  const quote = deserializeQuoteRecord(serializeQuoteRecord(quoteWithOverage()))!;
  const before = structuredClone(quote);
  const metrics = buildCommercialMetrics(quote);
  assert.equal(metrics.recurringRevenue, 200);
  assert.equal(metrics.recurringGrossProfit, 120);
  assert.equal(metrics.recurringGrossMarginPercent, 60);
  assert.equal(metrics.totalRevenue, 200);
  assert.equal(metrics.totalGrossProfit, 120);
  assert.deepEqual(quote, before);
  assert.equal(quote.sections.sectionA.poolRows[1].monthlyRate, 0.55);
  quote.sections.sectionA.poolRows[1].totalMonthlyRate = 999;
  assert.equal(buildCommercialMetrics(quote).recurringRevenue, 200);
});

test("disabled or optional usage and recurring rows cannot contribute internal recurring revenue", () => {
  const quote = quoteWithOverage();
  quote.sections.sectionA.poolRows[0].optional = true;
  assert.equal(buildCommercialMetrics(quote).recurringRevenue, 0);
  quote.sections.sectionA.poolRows[0].optional = false;
  quote.sections.sectionA.enabled = false;
  assert.equal(buildCommercialMetrics(quote).recurringRevenue, 0);
});

test("Quick Quote conversion to Major Project keeps overages outside internal monthly and contract totals", () => {
  const quote = quoteWithOverage();
  quote.sections.sectionA.termMonths = 12;
  const converted = convertQuickQuoteToMajorProject(quote);
  const metrics = buildCommercialMetrics(converted);
  assert.equal(metrics.recurringRevenue, 200);
  assert.equal(metrics.totalRevenue, 2400);
  assert.equal(metrics.recurringGrossProfit, 120);
});

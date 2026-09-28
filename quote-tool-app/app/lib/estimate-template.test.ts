import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IliosEstimateDocument } from "../components/ilios-estimate-document";
import { buildEstimateTemplateModel } from "./estimate-template";
import { createBlankQuoteRecord } from "./quote-template";
import { getOrderProcessing } from "./order-processing";

function estimateWithOverage() {
  const quote = createBlankQuoteRecord();
  quote.metadata.companyKey = "ilios";
  quote.metadata.outputTemplateKey = "estimate_compact";
  quote.metadata.salesTaxAmount = 10;
  quote.orderProcessing = { ...getOrderProcessing(quote), overageOptIn: "yes" };
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    { id: "plan", rowType: "service", description: "Data plan", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 },
    { id: "overage", rowType: "overage", description: "Overages", quantity: null, unitLabel: "GB", monthlyRate: 0.55, totalMonthlyRate: 0.55 },
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "case", sourceType: "custom", itemName: "Case", quantity: 1, unitPrice: 500, totalPrice: 500 }];
  return quote;
}

test("compact estimate preserves legacy overage rates but never treats them as line amounts or fixed totals", () => {
  const quote = estimateWithOverage();
  const before = structuredClone(quote);
  const model = buildEstimateTemplateModel(quote)!;
  assert.equal(model.monthlyTotal, 100);
  assert.equal(model.subtotal, 600);
  assert.equal(model.total, 610);
  const overage = model.lineItems.find(item => item.id === "overage")!;
  assert.equal(overage.rate, 0.55);
  assert.equal(overage.amount, 0);
  assert.equal(overage.schedule, "usage_based");
  assert.deepEqual(quote, before);
  quote.sections.sectionA.poolRows[1].monthlyRate = 0.75;
  const edited = buildEstimateTemplateModel(quote)!;
  assert.equal(edited.lineItems.find(item => item.id === "overage")!.rate, 0.75);
  assert.equal(edited.total, 610);
});

test("compact customer output shows the per-GB rate separately from fixed line amounts and totals", () => {
  const html = renderToStaticMarkup(createElement(IliosEstimateDocument, { quote: estimateWithOverage() }));
  assert.match(html, /Overage rate: \$0\.55 per GB/);
  assert.equal((html.match(/\$0\.55/g) || []).length, 1);
  assert.match(html, /Not included in the quoted monthly, one-time, or annual totals/);
  assert.match(html, /\$610\.00/);
});

test("compact customer output hides a saved overage price when opted out", () => {
  const quote = estimateWithOverage();
  quote.orderProcessing!.overageOptIn = "no";
  const html = renderToStaticMarkup(createElement(IliosEstimateDocument, { quote }));
  assert.match(html, /Opted out/);
  assert.doesNotMatch(html, /\$0\.55/);
  assert.match(html, /\$610\.00/);
});

test("optional overage rates remain visible without increasing optional monthly or estimate totals", () => {
  const quote = estimateWithOverage();
  quote.sections.sectionA.poolRows[1].optional = true;
  const model = buildEstimateTemplateModel(quote)!;
  assert.ok(!model.lineItems.some(item => item.id === "overage"));
  assert.equal(model.optionCostItems[0].usageBased, true);
  assert.equal(model.optionCostItems[0].amount, 0.55);
  assert.equal(model.optionCostMonthlyTotal, 0);
  assert.equal(model.total, 610);
});

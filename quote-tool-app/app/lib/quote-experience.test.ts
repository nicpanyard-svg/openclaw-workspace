import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import {
  getComparisonScenarios,
  getPricingReviewItems,
} from "./quote-experience";
import {
  fixtureComponent,
  fixtureQuote,
} from "../../scripts/quote-master-fixtures";

function quick() {
  const quote = createBlankQuoteRecord();
  quote.metadata.quoteType = "purchase";
  quote.metadata.hasActiveDataAgreement = true;
  quote.metadata.leaseMarginPercent = 35;
  quote.metadata.salesTaxAmount = 0;
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [
    {
      id: "data",
      rowType: "service",
      description: "Data",
      quantity: 1,
      totalMonthlyRate: 100,
    },
  ];
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [
    {
      id: "kit",
      itemName: "Terminal",
      sourceType: "custom",
      quantity: 1,
      unitPrice: 650,
      totalPrice: 650,
    },
  ];
  quote.commercial.costs.oneTimeEquipmentCost = 650;
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [
    {
      id: "install",
      description: "Install",
      sourceType: "custom",
      quantity: 1,
      unitPrice: 50,
      totalPrice: 50,
    },
    {
      id: "annual",
      description: "License",
      sourceType: "custom",
      quantity: 1,
      unitPrice: 1200,
      totalPrice: 1200,
      billing: { cadence: "annual" },
    },
    {
      id: "renewal",
      description: "Renewal",
      sourceType: "custom",
      quantity: 1,
      unitPrice: 300,
      totalPrice: 300,
      billing: { cadence: "annual", startsYear: 2 },
    },
    {
      id: "option",
      description: "Optional",
      sourceType: "custom",
      quantity: 1,
      unitPrice: 500,
      totalPrice: 500,
      optional: true,
    },
  ];
  return quote;
}

test("comparison reuses pricing without mutating the quote, mixing annual charges, or double-charging leased equipment", () => {
  const quote = quick(),
    before = structuredClone(quote),
    scenarios = getComparisonScenarios(quote, "terms");
  assert.deepEqual(quote, before);
  assert.deepEqual(
    scenarios.map((row) => row.id),
    [
      "purchase",
      "lease-3",
      "lease-6",
      "lease-9",
      "lease-12",
      "lease-24",
      "lease-36",
    ],
  );
  assert.equal(scenarios[0].monthly, 100);
  assert.equal(scenarios[0].oneTime, 700);
  assert.equal(scenarios[1].monthly, 433.33);
  assert.equal(scenarios[2].monthly, 266.67);
  assert.equal(scenarios[3].monthly, 211.11);
  for (const scenario of scenarios) {
    assert.equal(scenario.oneTime, scenario.id === "purchase" ? 700 : 50);
    assert.equal(scenario.annualFirstYear, 1200);
    assert.equal(scenario.annualRenewal, 1500);
    assert.equal(scenario.options.oneTimeTotal, 500);
    assert.equal(scenario.selected, scenario.id === "purchase");
  }
  assert.doesNotMatch(
    JSON.stringify(scenarios),
    /margin|vendorCost|unitCost|commercial/i,
  );
});

test("lease alternatives stay locked until an active data agreement is confirmed", () => {
  const quote = quick();
  quote.metadata.hasActiveDataAgreement = false;
  const scenarios = getComparisonScenarios(quote, "terms");
  assert.equal(scenarios[0].monthly, 100);
  assert.ok(scenarios.slice(1).every((row) => row.monthly === null));
});

test("Major Project comparisons calculate each saved option separately", () => {
  const quote = fixtureQuote("QA-COMPARE", "Options", [
    fixtureComponent("One", 1000, 500),
  ]);
  const second = structuredClone(quote.majorProject.options[0]);
  second.id = "second";
  second.label = "Two";
  second.components = [fixtureComponent("Two", 2000, 1200)];
  quote.majorProject.options.push(second);
  const before = structuredClone(quote),
    scenarios = getComparisonScenarios(quote, "options");
  assert.deepEqual(quote, before);
  assert.deepEqual(
    scenarios.map((row) => row.oneTime),
    [1000, 2000],
  );
  assert.deepEqual(
    scenarios.map((row) => row.selected),
    [true, false],
  );
});

test("readiness identifies unpriced and invalid lines, ignoring disabled sections and usage rows", () => {
  const quote = quick();
  quote.customer.addressLines = [];
  quote.sections.sectionA.poolRows.push({
    id: "usage",
    rowType: "overage",
    description: "Usage",
    quantity: 0,
    totalMonthlyRate: 0,
  });
  quote.sections.sectionB.lineItems[0].totalPrice = 0;
  assert.deepEqual(
    getPricingReviewItems(quote).map((item) => item.tab),
    ["customer", "items"],
  );
  quote.sections.sectionB.lineItems[0].quantity = -1;
  assert.match(getPricingReviewItems(quote)[2].message, /quantities/);
  quote.sections.sectionB.enabled = false;
  quote.customer.addressLines = ["1 Test Road"];
  assert.deepEqual(getPricingReviewItems(quote), []);
});

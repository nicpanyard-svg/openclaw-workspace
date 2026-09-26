import assert from "node:assert/strict";
import test from "node:test";
import { prefillStarlinkRates, PROCESSING_RATES, missingProcessingRequirements, normalizeProcessingRequirements } from "./processing-requirements";
import { createBlankQuoteRecord } from "./quote-template";
import { getOrderProcessing, buildOrderProcessingText } from "./order-processing";
import { serializeQuoteRecord, deserializeQuoteRecord } from "./proposal-state";

function readyQuote() {
  const quote = createBlankQuoteRecord();
  quote.customer.name = "Processing QA";
  quote.customer.addressLines = ["10 Service Rd"];
  quote.customer.contactName = "Pat"; quote.customer.contactPhone = "555-0100";
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "kit", sourceType: "custom", itemName: "Remote kit", quantity: 2, unitPrice: 100, totalPrice: 200 }];
  quote.orderProcessing = { ...getOrderProcessing(quote), dataPlanDetails: "Shared 500GB pool", shippingRequired: "no", overageOptIn: "no", notes: "None", requirements: {
    ...normalizeProcessingRequirements(undefined), publicIp: "no", pricingStructure: "individual", subAccountStatus: "no", corporatePricing: "yes", equipmentRequired: "yes", equipment: { kit: { kind: "assembly", assemblyDetails: "Router + antenna" } },
  } };
  return quote;
}
test("all requirements start unconfirmed and prevent quote creation", () => {
  const quote = createBlankQuoteRecord();
  assert.deepEqual(missingProcessingRequirements(quote), ["Customer", "Sub-account decision", "Data plan / allocation details", "Corporate pricing decision", "Equipment needed decision", "Overage opt-in decision", "Public IP decision", "Shipping decision", "Service address", "POC name", "POC phone number", "Special instructions (or None)"]);
});
test("corporate pricing skips individual rates, applicable sub-accounts require an ID", () => {
  const quote = readyQuote();
  assert.deepEqual(missingProcessingRequirements(quote), []);
  quote.orderProcessing!.requirements!.subAccountStatus = "yes";
  assert.deepEqual(missingProcessingRequirements(quote), ["Sub-account name / ID"]);
  quote.orderProcessing!.requirements!.subAccount = "West division";
  assert.deepEqual(missingProcessingRequirements(quote), []);
});
test("non-corporate pricing requires all five rates and valid amounts and units", () => {
  const quote = readyQuote(), details = quote.orderProcessing!.requirements!;
  details.corporatePricing = "no";
  assert.deepEqual(missingProcessingRequirements(quote), PROCESSING_RATES.filter(row => row.key !== "poolTac").map(row => `${row.label} pricing`));
  for (const { key } of PROCESSING_RATES) details.rates[key] = { status: "priced", amount: 0, basis: "per month" };
  assert.deepEqual(missingProcessingRequirements(quote), []);
  for (const amount of [null, -1, NaN, Infinity]) {
    details.rates.data50.amount = amount;
    assert.ok(missingProcessingRequirements(quote).includes("50GB pricing"));
  }
  details.rates.data50 = { status: "included", amount: null, basis: "" };
  details.rates.data500 = { status: "not_applicable", amount: null, basis: "" };
  details.rates.overages.basis = " ";
  assert.deepEqual(missingProcessingRequirements(quote), ["Overages pricing"]);
});
test("every included equipment row requires assembly selection, quantity and price", () => {
  const quote = readyQuote();
  quote.orderProcessing!.requirements!.equipment = {};
  assert.deepEqual(missingProcessingRequirements(quote), ["Remote kit: assembly or standalone"]);
  quote.sections.sectionB.lineItems[0].quantity = 0;
  quote.sections.sectionB.lineItems[0].unitPrice = -1;
  assert.ok(missingProcessingRequirements(quote).includes("Remote kit: equipment quantity"));
  assert.ok(missingProcessingRequirements(quote).includes("Remote kit: equipment pricing"));
  quote.sections.sectionB.lineItems[0].optional = true;
  quote.orderProcessing!.requirements!.equipmentRequired = "no";
  assert.deepEqual(missingProcessingRequirements(quote), []);
});
test("required details survive save/load and appear in the processing summary without changing prices", () => {
  const quote = readyQuote(), details = quote.orderProcessing!.requirements!;
  details.subAccountStatus = "yes"; details.subAccount = "WEST-123"; details.corporatePricing = "no";
  for (const { key, basis } of PROCESSING_RATES) details.rates[key] = { status: "priced", amount: 25, basis };
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.deepEqual(restored.orderProcessing!.requirements, details);
  assert.deepEqual(restored.sections.sectionB.lineItems, quote.sections.sectionB.lineItems);
  const output = buildOrderProcessingText(restored);
  for (const text of ["Sub account: WEST-123", "Corporate pricing: No", "Data Plan/Pool: Shared 500GB pool", "Assembly: Yes", "Router + antenna", "TAC (terminal access charge): $25.00", "50GB: $25.00", "500GB: $25.00", "Overages: $25.00 per GB"]) assert.ok(output.includes(text), text);
});

test("pool pricing requires only Pool TAC and management/support, plus explicit order decisions", () => {
  const quote = readyQuote(), details = quote.orderProcessing!.requirements!;
  details.corporatePricing = "no"; details.pricingStructure = "pool";
  assert.deepEqual(missingProcessingRequirements(quote), ["Management and support fee pricing", "Pool TAC pricing"]);
  quote.orderProcessing!.requirements = prefillStarlinkRates(details);
  assert.deepEqual(missingProcessingRequirements(quote), []);
  const text = buildOrderProcessingText(quote);
  assert.ok(text.includes("Pool TAC: $42.00 per terminal / month"));
  assert.ok(!text.includes("50GB:"));
  quote.orderProcessing!.requirements.publicIp = "pending";
  quote.orderProcessing!.overageOptIn = "pending";
  quote.orderProcessing!.notes = "";
  assert.deepEqual(missingProcessingRequirements(quote), ["Overage opt-in decision", "Public IP decision", "Special instructions (or None)"]);
});
test("Starlink prices match the supplied sheet and user corrections; edits survive prefill and save", () => {
  const original = normalizeProcessingRequirements(undefined);
  const fixed = prefillStarlinkRates(original);
  assert.deepEqual(PROCESSING_RATES.map(({ key }) => fixed.rates[key].amount), [10, 42, 27.5, 131.25, 0.55, 42]);
  assert.equal(original.rates.data50.status, "pending");
  fixed.rates.data50.amount = 30;
  fixed.rates.poolTac.amount = 39;
  const edited = prefillStarlinkRates(fixed);
  assert.equal(edited.rates.data50.amount, 30);
  assert.equal(edited.rates.poolTac.amount, 39);
  assert.equal(prefillStarlinkRates({ ...original, starlinkService: "mini_vehicle" }).rates.managementSupport.amount, 5);
  assert.equal(prefillStarlinkRates(edited, true).rates.data50.amount, 27.5);
  const quote = readyQuote(); quote.orderProcessing!.requirements = edited;
  assert.equal(deserializeQuoteRecord(serializeQuoteRecord(quote))!.orderProcessing!.requirements!.rates.data50.amount, 30);
});

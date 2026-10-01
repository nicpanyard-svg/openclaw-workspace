import assert from "node:assert/strict";
import test from "node:test";
import { prefillStarlinkRates, PROCESSING_RATES, missingProcessingRequirements, normalizeProcessingRequirements } from "./processing-requirements";
import { createBlankQuoteRecord } from "./quote-template";
import { getOrderProcessing, buildOrderProcessingText } from "./order-processing";
import { serializeQuoteRecord, deserializeQuoteRecord } from "./proposal-state";
import { applyMajorProjectToQuote, convertQuickQuoteToMajorProject } from "./major-project";
import { hasStarlinkService } from "./starlink-service";

test("equipment-only quotes ignore saved Starlink answers without changing prices or uploaded data", () => {
  const quote = readyQuote();
  quote.sections.sectionA.poolRows = [];
  quote.sections.sectionA.perKitRows = [];
  quote.orderProcessing!.dataPlanDetails = "";
  quote.orderProcessing!.overageOptIn = "yes";
  quote.orderProcessing!.requirements = {
    ...normalizeProcessingRequirements(undefined), subAccountStatus: "no", corporatePricing: "no",
  };
  const before = structuredClone(quote);
  assert.equal(hasStarlinkService(quote), false);
  assert.deepEqual(missingProcessingRequirements(quote), []);
  const text = buildOrderProcessingText(quote);
  assert.doesNotMatch(text, /TAC|Overage|Data Plan|Public IP|Pricing structure/);
  assert.match(text, /Remote kit/);
  assert.deepEqual(quote, before);
  const major = convertQuickQuoteToMajorProject(quote);
  major.orderProcessing!.requirements!.equipment = {};
  const missing = missingProcessingRequirements(major);
  assert.equal(hasStarlinkService(major), false);
  assert.ok(missing.length > 0 && missing.every(item => item.includes("assembly or standalone")));
});

test("disabled, inactive and optional subscription lines do not enable Starlink setup", () => {
  const quote = readyQuote();
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.enabled = false;
  assert.equal(hasStarlinkService(quote), false);
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.poolRows.forEach(row => { row.optional = true; });
  assert.equal(hasStarlinkService(quote), false);
  quote.sections.sectionA.poolRows[0].optional = false;
  assert.equal(hasStarlinkService(quote), true);
});

test("managed-network Major Projects do not inherit Starlink-only questions", () => {
  const quote = convertQuickQuoteToMajorProject(readyQuote());
  quote.majorProject.commercial.serviceMix = "managed-network";
  const option = quote.majorProject.options.find(option => option.id === quote.majorProject.activeOptionId)!;
  for (const component of option.components ?? []) {
    if (component.schedule === "recurring") component.customerFacingLabel = "Managed firewall";
  }
  assert.equal(hasStarlinkService(quote), false);
  quote.orderProcessing!.requirements!.corporatePricing = "pending";
  quote.orderProcessing!.requirements!.publicIp = "pending";
  quote.orderProcessing!.overageOptIn = "pending";
  quote.orderProcessing!.dataPlanDetails = "";
  assert.ok(!missingProcessingRequirements(quote).some(item => /pricing|Overage|Public IP|Data plan/.test(item)));
});

function readyQuote() {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.poolRows = [{ id: "plan", rowType: "service", description: "Starlink data", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 }];
  quote.sections.sectionA.perKitRows = [{ ...quote.sections.sectionA.poolRows[0], rowType: "service" }];
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
  assert.deepEqual(missingProcessingRequirements(quote), ["Customer", "Sub-account decision", "Equipment needed decision", "Shipping decision", "Service address", "POC name", "POC phone number", "Special instructions (or None)"]);
});
test("corporate pricing skips individual rates, applicable sub-accounts require an ID", () => {
  const quote = readyQuote();
  assert.deepEqual(missingProcessingRequirements(quote), []);
  quote.orderProcessing!.requirements!.subAccountStatus = "yes";
  assert.deepEqual(missingProcessingRequirements(quote), ["Sub-account name / ID"]);
  quote.orderProcessing!.requirements!.subAccount = "West division";
  assert.deepEqual(missingProcessingRequirements(quote), []);
});
test("non-corporate pricing requires four service rates with overages elected separately", () => {
  const quote = readyQuote(), details = quote.orderProcessing!.requirements!;
  details.corporatePricing = "no";
  assert.deepEqual(missingProcessingRequirements(quote), PROCESSING_RATES.filter(row => !["poolTac", "overages"].includes(row.key)).map(row => `${row.label} pricing`));
  for (const { key } of PROCESSING_RATES) details.rates[key] = { status: "priced", amount: 0, basis: "per month" };
  assert.deepEqual(missingProcessingRequirements(quote), []);
  for (const amount of [null, -1, NaN, Infinity]) {
    details.rates.data50.amount = amount;
    assert.ok(missingProcessingRequirements(quote).includes("50GB pricing"));
  }
  details.rates.data50 = { status: "included", amount: null, basis: "" };
  details.rates.data500 = { status: "not_applicable", amount: null, basis: "" };
  details.rates.overages.basis = " ";
  assert.deepEqual(missingProcessingRequirements(quote), [], "opted-out quotes do not require an overage rate");
  quote.orderProcessing!.overageOptIn = "yes";
  assert.deepEqual(missingProcessingRequirements(quote), ["Overage price"]);
});
test("Quick Quote equipment is standalone without assembly confirmation and still requires quantity and price", () => {
  const quote = readyQuote();
  quote.orderProcessing!.requirements!.equipment = {};
  assert.deepEqual(missingProcessingRequirements(quote), []);
  assert.ok(buildOrderProcessingText(quote).includes("Assembly: No (standalone)"));
  quote.orderProcessing!.requirements!.equipment.kit = { kind: "pending", assemblyDetails: "" };
  assert.deepEqual(missingProcessingRequirements(quote), []);
  quote.sections.sectionB.lineItems[0].quantity = 0;
  quote.sections.sectionB.lineItems[0].unitPrice = -1;
  assert.deepEqual(missingProcessingRequirements(quote), ["Remote kit: equipment quantity", "Remote kit: equipment pricing"]);
  quote.sections.sectionB.lineItems[0].optional = true;
  quote.orderProcessing!.requirements!.equipmentRequired = "no";
  assert.deepEqual(missingProcessingRequirements(quote), []);
});
test("Major Project equipment still requires assembly selection and exports confirmed assembly details", () => {
  const quote = convertQuickQuoteToMajorProject(readyQuote());
  const row = applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0];
  quote.orderProcessing!.requirements!.equipment = {};
  assert.deepEqual(missingProcessingRequirements(quote), ["Remote kit: assembly or standalone"]);
  assert.throws(() => buildOrderProcessingText(quote), /Remote kit: assembly or standalone/);
  quote.orderProcessing!.requirements!.equipment[row.id] = { kind: "assembly", assemblyDetails: "Router + antenna" };
  assert.deepEqual(missingProcessingRequirements(quote), []);
  const output = buildOrderProcessingText(quote);
  assert.ok(output.includes("Assembly: Yes"));
  assert.ok(output.includes("Assembly details: Router + antenna"));
  quote.orderProcessing!.requirements!.equipment[row.id].kind = "standalone";
  assert.deepEqual(missingProcessingRequirements(quote), []);
  assert.ok(buildOrderProcessingText(quote).includes("Assembly: No (standalone)"));
  assert.ok(!buildOrderProcessingText(quote).includes("Router + antenna"));
});

test("Quick Quote save/load retains prices and required details but ignores stale assembly flags in the processing summary", () => {
  const quote = readyQuote(), details = quote.orderProcessing!.requirements!;
  details.subAccountStatus = "yes"; details.subAccount = "WEST-123"; details.corporatePricing = "no";
  quote.orderProcessing!.overageOptIn = "yes";
  for (const { key, basis } of PROCESSING_RATES) details.rates[key] = { status: "priced", amount: 25, basis };
  details.rates.overages.basis = "per 50GB block";
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.deepEqual(restored.orderProcessing!.requirements, details);
  assert.deepEqual(restored.sections.sectionB.lineItems, quote.sections.sectionB.lineItems);
  const output = buildOrderProcessingText(restored);
  for (const text of ["Sub account: WEST-123", "Corporate pricing: No", "Data Plan/Pool: Shared 500GB pool", "Assembly: No (standalone)", "TAC (terminal access charge): $25.00", "50GB: $25.00", "500GB: $25.00", "$25.00 per 50GB block"]) assert.ok(output.includes(text), text);
  assert.ok(!output.includes("Assembly: Yes"));
  assert.ok(!output.includes("Assembly details:"));
  assert.ok(!output.includes("Router + antenna"));
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
  assert.equal(prefillStarlinkRates(original).rates.overages.status, "pending", "no overage plan is guessed before selection");
  const blocks = prefillStarlinkRates({ ...original, pricingStructure: "individual" });
  assert.deepEqual(blocks.rates.overages, { status: "priced", amount: 32.5, basis: "per 50GB block" });
  assert.equal(blocks.rates.data50.amount, 27.5, "base 50GB plan remains unchanged by the overage correction");
  blocks.rates.overages.amount = 37.25;
  assert.equal(prefillStarlinkRates(blocks).rates.overages.amount, 37.25);
  const fixed = prefillStarlinkRates({ ...original, pricingStructure: "pool" });
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

test("every pricing structure requires an explicit overage decision and an opted-in price", () => {
  for (const corporatePricing of ["yes", "no"] as const) for (const pricingStructure of ["individual", "pool"] as const) {
    const quote = readyQuote();
    quote.sections.sectionA.mode = pricingStructure === "pool" ? "pool" : "per_kit";
    quote.orderProcessing!.requirements = prefillStarlinkRates({ ...quote.orderProcessing!.requirements!, corporatePricing, pricingStructure });
    const rate = quote.orderProcessing!.requirements!.rates.overages;
    for (const decision of ["pending", "not_applicable"] as const) {
      quote.orderProcessing!.overageOptIn = decision;
      assert.deepEqual(missingProcessingRequirements(quote), ["Overage opt-in decision"]);
    }
    quote.orderProcessing!.overageOptIn = "yes";
    for (const status of ["pending", "included", "not_applicable"] as const) {
      rate.status = status;
      assert.deepEqual(missingProcessingRequirements(quote), ["Overage price"]);
    }
    rate.status = "priced";
    rate.amount = null;
    assert.deepEqual(missingProcessingRequirements(quote), ["Overage price"]);
    rate.amount = 0;
    assert.deepEqual(missingProcessingRequirements(quote), []);
    quote.orderProcessing!.overageOptIn = "no";
    rate.amount = null;
    assert.deepEqual(missingProcessingRequirements(quote), []);
  }
});

test("conflicting structured and legacy overage prices block completion until confirmed", () => {
  const quote = readyQuote();
  quote.orderProcessing!.overageOptIn = "yes";
  quote.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: 0.55, basis: "per GB" };
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [{ id: "usage", rowType: "overage", description: "Usage", unitPrice: 0.42, unitLabel: "GB", totalMonthlyRate: 0 }];
  assert.deepEqual(missingProcessingRequirements(quote), ["Overage price"]);
  quote.orderProcessing!.requirements!.rates.overages.amount = 0.42;
  assert.deepEqual(missingProcessingRequirements(quote), []);
});

test("overage billing basis must match the selected plan without relabeling saved prices", () => {
  const quote = readyQuote();
  quote.orderProcessing!.overageOptIn = "yes";
  quote.orderProcessing!.requirements = prefillStarlinkRates({ ...quote.orderProcessing!.requirements!, corporatePricing: "no", pricingStructure: "individual" });
  const rate = quote.orderProcessing!.requirements.rates.overages;
  rate.amount = 0.55;
  rate.basis = "per GB";
  assert.deepEqual(missingProcessingRequirements(quote), ["Overage price"]);
  assert.equal(rate.amount, 0.55);
  assert.equal(rate.basis, "per GB");
  rate.amount = 32.5;
  rate.basis = "per 50GB block";
  assert.deepEqual(missingProcessingRequirements(quote), []);
  quote.orderProcessing!.requirements.pricingStructure = "pool";
  assert.deepEqual(missingProcessingRequirements(quote), ["Overage price"]);
  quote.orderProcessing!.overageOptIn = "no";
  assert.deepEqual(missingProcessingRequirements(quote), [], "opted-out quotes preserve inactive saved rates");
});

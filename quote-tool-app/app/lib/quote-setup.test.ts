import assert from "node:assert/strict";
import test from "node:test";
import { applyMajorProjectToQuote, convertQuickQuoteToMajorProject, getActiveMajorProjectOption } from "./major-project";
import { getOrderProcessing } from "./order-processing";
import { missingProcessingRequirements, normalizeProcessingRequirements, prefillStarlinkRates } from "./processing-requirements";
import { getQuoteSetupSteps, type QuoteSetupStepId } from "./quote-setup";
import { createBlankQuoteRecord } from "./quote-template";
import type { QuoteRecord } from "./quote-record";

function missingFor(quote: QuoteRecord, id: QuoteSetupStepId) {
  return getQuoteSetupSteps(quote).find(step => step.id === id)!.missing;
}

function readyQuote() {
  const quote = createBlankQuoteRecord();
  Object.assign(quote.customer, { name: "North site", addressLines: ["10 Service Rd"], contactName: "Pat", contactPhone: "555-0100" });
  quote.orderProcessing = {
    ...getOrderProcessing(quote), dataPlanDetails: "500GB shared pool", shippingRequired: "no", overageOptIn: "no", notes: "None",
    requirements: { ...normalizeProcessingRequirements(undefined), subAccountStatus: "no", publicIp: "no", equipmentRequired: "no", corporatePricing: "yes" },
  };
  return quote;
}

test("a blank order gives each missing requirement one actionable step and preserves the full review checklist", () => {
  const quote = createBlankQuoteRecord();
  const steps = getQuoteSetupSteps(quote);
  assert.deepEqual(steps.map(step => step.title), ["Contact & site", "Equipment", "Plan & rates", "Delivery", "Review"]);
  assert.deepEqual(missingFor(quote, "contact"), ["Customer", "Sub-account decision", "Service address", "POC name", "POC phone number"]);
  assert.deepEqual(missingFor(quote, "equipment"), ["Equipment needed decision"]);
  assert.deepEqual(missingFor(quote, "pricing"), ["Data plan / allocation details", "Corporate pricing decision"]);
  assert.deepEqual(missingFor(quote, "delivery"), ["Overage opt-in decision", "Public IP decision", "Shipping decision", "Special instructions (or None)"]);
  const canonical = missingProcessingRequirements(quote);
  assert.deepEqual(missingFor(quote, "review"), canonical);
  assert.deepEqual(steps.filter(step => step.id !== "review").flatMap(step => step.missing).sort(), [...canonical].sort());
});

test("conditional sub-account and shipping details stay on the relevant step until filled", () => {
  const quote = readyQuote();
  assert.ok(getQuoteSetupSteps(quote).every(step => step.missing.length === 0));
  quote.orderProcessing!.requirements!.subAccountStatus = "yes";
  quote.orderProcessing!.shippingRequired = "yes";
  quote.shippingSameAsBillTo = false;
  quote.shipTo = { companyName: "North site", lines: [], attention: "" };
  quote.orderProcessing!.shippingContactPhone = "";
  assert.deepEqual(missingFor(quote, "contact"), ["Sub-account name / ID"]);
  assert.deepEqual(missingFor(quote, "delivery"), ["Shipping address", "Shipping contact name", "Shipping contact phone"]);
  quote.orderProcessing!.requirements!.subAccount = "NORTH-1";
  quote.shipTo = { companyName: "North site", lines: ["20 Warehouse Rd"], attention: "Morgan" };
  quote.orderProcessing!.shippingContactPhone = "555-0101";
  assert.ok(getQuoteSetupSteps(quote).every(step => step.missing.length === 0));
});

test("the pricing step follows corporate, individual, and pool choices and retains editable rate validation", () => {
  const quote = readyQuote(), details = quote.orderProcessing!.requirements!;
  assert.deepEqual(missingFor(quote, "pricing"), [], "corporate pricing does not require separate rate decisions");
  details.corporatePricing = "no";
  assert.deepEqual(missingFor(quote, "pricing"), ["Individual or pool pricing decision"]);
  details.pricingStructure = "individual";
  assert.deepEqual(missingFor(quote, "pricing"), ["Management and support fee pricing", "TAC (terminal access charge) pricing", "50GB pricing", "500GB pricing", "Overages pricing"]);
  details.pricingStructure = "pool";
  assert.deepEqual(missingFor(quote, "pricing"), ["Management and support fee pricing", "Pool TAC pricing"]);
  quote.orderProcessing!.requirements = prefillStarlinkRates(details);
  quote.orderProcessing!.requirements.rates.poolTac.amount = null;
  assert.deepEqual(missingFor(quote, "pricing"), ["Pool TAC pricing"]);
  quote.orderProcessing!.requirements.rates.poolTac.amount = 39;
  assert.deepEqual(missingFor(quote, "review"), []);
});

test("Major Project equipment uses the current generated output and updates when a component changes", () => {
  const quickQuote = readyQuote();
  quickQuote.sections.sectionB.enabled = true;
  quickQuote.sections.sectionB.lineItems = [{ id: "kit", sourceType: "custom", itemName: "Remote kit", quantity: 2, unitPrice: 100, totalPrice: 200 }];
  const quote = convertQuickQuoteToMajorProject(quickQuote);
  const component = getActiveMajorProjectOption(quote)!.components!.find(item => item.lineType === "hardware")!;
  component.customerFacingLabel = "Updated terminal assembly";
  component.quantity = 0;
  const original = structuredClone(quote);
  assert.deepEqual(missingFor(quote, "equipment"), ["Updated terminal assembly: assembly or standalone", "Updated terminal assembly: equipment quantity"]);
  assert.deepEqual(missingFor(quote, "review"), missingProcessingRequirements(quote));
  assert.deepEqual(quote, original, "grouping must not mutate the quote or its project model");
  component.quantity = 2;
  const row = applyMajorProjectToQuote(quote).sections.sectionB.lineItems[0];
  quote.orderProcessing!.requirements!.equipment[row.id] = { kind: "assembly", assemblyDetails: "Terminal and router" };
  assert.deepEqual(missingFor(quote, "equipment"), []);
  assert.deepEqual(missingFor(quote, "review"), []);
});

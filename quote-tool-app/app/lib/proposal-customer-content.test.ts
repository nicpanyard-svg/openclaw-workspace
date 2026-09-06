import assert from "node:assert/strict";
import test from "node:test";
import { customerCopy, getCustomerQuoteContent, getFieldServiceConfirmationKey, normalizeCustomerOutput } from "./proposal-customer-content";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { createBlankQuoteRecord } from "./quote-template";
import { buildTermsFromPackage } from "./terms-packages";

function customerQuote() {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.termMonths = 36;
  quote.sections.sectionA.perKitRows = [{ id: "base", rowType: "service", description: "Connectivity", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 }];
  quote.metadata.quoteType = "purchase";
  return quote;
}

test("legacy service commitment follows the selected term without mutating stored terms", () => {
  const quote = customerQuote();
  const original = JSON.stringify(quote);
  const content = getCustomerQuoteContent(quote);
  assert.ok(content.pricingTerms.some((line) => line.includes("36-month subscription commitment")));
  assert.ok(!content.pricingTerms.some((line) => line.includes("12 Month Term")));
  assert.equal(JSON.stringify(quote), original);
});

test("custom terms are preserved and contradictory commitments are flagged", () => {
  const quote = customerQuote();
  quote.terms.pricingTerms = ["Special commercial terms apply.", "The service requires a 24 month commitment."];
  const content = getCustomerQuoteContent(quote);
  assert.deepEqual(content.pricingTerms, quote.terms.pricingTerms);
  assert.ok(content.warnings.some((line) => line.includes("written service term")));
  assert.equal(content.approvalReady, false);
});

test("placeholder terms never become customer contract copy", () => {
  const quote = customerQuote();
  quote.terms.pricingTerms = ["Placeholder: must be replaced with approved final terms."];
  quote.terms.generalStarlinkServiceTermsTitle = "Placeholder package";
  quote.terms.generalStarlinkServiceTerms = ["Support is available Monday through Friday."];
  const content = getCustomerQuoteContent(quote);
  assert.deepEqual(content.pricingTerms, []);
  assert.equal(content.serviceTermsTitle, "Service terms");
  assert.equal(content.isDraft, true);
  assert.equal(content.approvalReady, false);
});

test("authoring defaults are removed without suppressing real technical descriptions", () => {
  for (const text of ["Manual row", "Base deployment structure", "Internal validation flagged missing mappings.", "Hardware lines are flowing directly from the bill of materials.", "Internal monthly cost 22.50", "Built from Major Project row buckets with live margin rollups.", "Generated directly from the Major Project component list"]) {
    assert.equal(customerCopy(text), "");
  }
  assert.equal(customerCopy("Router with internal antenna and manual configuration"), "Router with internal antenna and manual configuration");
  assert.equal(customerCopy("Installation includes internal cable routing."), "Installation includes internal cable routing.");
});

test("lease acceptance requires explicit agreement and end-of-lease terms", () => {
  const quote = customerQuote();
  quote.metadata.quoteType = "lease";
  quote.metadata.leaseTermMonths = 3;
  quote.metadata.hasActiveDataAgreement = false;
  assert.equal(getCustomerQuoteContent(quote).approvalReady, false);
  quote.metadata.hasActiveDataAgreement = true;
  quote.customerOutput = { leaseEndTerms: "Return leased equipment.", postLeaseTerms: "Subscription continues at the quoted service rate.", billingStart: "On activation", deliveryLeadTime: "Two weeks" };
  const content = getCustomerQuoteContent(quote);
  assert.equal(content.approvalReady, true);
  assert.equal(content.serviceTermMonths, 36);
  const reloaded = deserializeQuoteRecord(serializeQuoteRecord(quote));
  assert.ok(reloaded);
  assert.deepEqual(reloaded.customerOutput, quote.customerOutput);
});

test("legacy records receive empty customer output settings", () => {
  assert.deepEqual(normalizeCustomerOutput(undefined), { leaseEndTerms: "", postLeaseTerms: "", deliveryLeadTime: "", billingStart: "" });
  assert.deepEqual(normalizeCustomerOutput({ leaseEndTerms: " Return equipment. ", postLeaseTerms: 42 }), { leaseEndTerms: "Return equipment.", postLeaseTerms: "", deliveryLeadTime: "", billingStart: "" });
});

test("disabled subscriptions do not introduce a commitment or service terms", () => {
  const quote = customerQuote();
  quote.sections.sectionA.enabled = false;
  const content = getCustomerQuoteContent(quote);
  assert.deepEqual(content.serviceTerms, []);
  assert.ok(!content.pricingTerms.some((line) => /subscription commitment|Starlink/i.test(line)));
  assert.ok(content.warnings.includes("No included scope has been selected."));
});

test("budgetary implementation and unresolved overages prevent order authorization", () => {
  const quote = customerQuote();
  quote.sections.sectionA.mode = "pool";
  quote.sections.sectionA.poolRows = [{ id: "overage", rowType: "overage", description: "Overage", quantity: 0, monthlyRate: 25, totalMonthlyRate: 0 }];
  quote.orderProcessing = { ...quote.orderProcessing!, overageOptIn: "pending" };
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [{ id: "install", sourceType: "custom", description: "Installation", quantity: 1, unitPrice: 50, totalPrice: 50, pricingStage: "budgetary" }];
  const content = getCustomerQuoteContent(quote);
  assert.ok(content.warnings.includes("The overage election has not been confirmed."));
  assert.ok(content.warnings.includes("Implementation and service pricing is budgetary and subject to confirmation based on final site count, configuration, and deployment requirements."));
  assert.ok(!content.warnings.includes("Field service pricing includes an estimate."));
  assert.equal(content.approvalReady, false);
});

test("budgetary pricing note follows included unconfirmed services in Quick and Major quotes", () => {
  const note = "Implementation and service pricing is budgetary and subject to confirmation based on final site count, configuration, and deployment requirements.";
  for (const workflowMode of ["quick_quote", "major_project"] as const) {
    const quote = customerQuote();
    quote.metadata.workflowMode = workflowMode;
    quote.sections.sectionC.enabled = true;
    quote.sections.sectionC.lineItems = [{ id: "implementation", sourceType: "custom", description: "AI implementation", quantity: 1, unitPrice: 100, totalPrice: 100, pricingStage: "budgetary" }];
    const saved = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
    assert.ok(getCustomerQuoteContent(saved).warnings.includes(note));
    saved.sections.sectionC.lineItems[0].pricingStage = "final";
    assert.ok(!getCustomerQuoteContent(saved).warnings.includes(note));
    saved.sections.sectionC.lineItems[0].pricingStage = "budgetary";
    saved.sections.sectionC.lineItems[0].optional = true;
    assert.ok(!getCustomerQuoteContent(saved).warnings.includes(note));
    saved.sections.sectionC.lineItems[0].optional = false;
    saved.sections.sectionC.enabled = false;
    assert.ok(!getCustomerQuoteContent(saved).warnings.includes(note));
  }
});

test("custom approval instructions survive while template customer-name filler is omitted", () => {
  const quote = customerQuote();
  assert.equal(getCustomerQuoteContent(quote).approvalNote, "");
  quote.approval.approvalNote = "Reference purchase order PO-123 with acceptance.";
  assert.equal(getCustomerQuoteContent(quote).approvalNote, quote.approval.approvalNote);
});

test("authoring warranty prompts are omitted and actual coverage is retained", () => {
  const quote = customerQuote();
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "router", sourceType: "custom", itemName: "Router", quantity: 1, unitPrice: 100, totalPrice: 100 }];
  quote.warranty.enabled = true;
  quote.warranty.manufacturerReference = "Manufacturer warranty coverage, exclusions, and any registration requirements should be confirmed.";
  quote.warranty.coverageNote = "Parts are covered for one year.";
  quote.warranty.claimNote = "Contact support for warranty claims.";
  assert.deepEqual(getCustomerQuoteContent(quote).warranty, [quote.warranty.coverageNote, quote.warranty.claimNote]);
});

test("authored section scope survives and mixed boilerplate loses only its generated sentence", () => {
  const quote = customerQuote();
  quote.sections.sectionA.introText = "Service is limited to the warehouse.";
  quote.sections.sectionA.explanatoryParagraphs = ["Data allocation is 1 TB per terminal."];
  quote.sections.sectionB.introText = "Hardware lines are flowing directly from components. Installation includes four additional remote sites.";
  quote.sections.sectionC.introText = "Civil works and trenching are excluded.";
  const content = getCustomerQuoteContent(quote);
  assert.equal(content.serviceIntro, quote.sections.sectionA.introText);
  assert.deepEqual(content.serviceNotes, quote.sections.sectionA.explanatoryParagraphs);
  assert.equal(content.equipmentIntro, "Installation includes four additional remote sites.");
  assert.equal(content.fieldServiceIntro, quote.sections.sectionC.introText);
});

test("a hardware payment condition mentioning Starlink is not removed without subscriptions", () => {
  const quote = customerQuote();
  quote.sections.sectionA.enabled = false;
  quote.terms.pricingTerms = ["Payment for Starlink hardware is due before shipment."];
  assert.deepEqual(getCustomerQuoteContent(quote).pricingTerms, quote.terms.pricingTerms);
});

test("saved AI/cloud quotes omit the stock Starlink integration sentence without changing their other terms", () => {
  const quote = customerQuote();
  const carryover = "Recurring Starlink-related pricing and one-time integration pricing may be governed by different commercial assumptions inside the same proposal.";
  quote.sections.sectionA.enabled = false;
  quote.terms.pricingTerms = [carryover, "Payment is due within 30 days.", "Annual subscription renewals are billed separately."];
  const original = JSON.stringify(quote);
  assert.deepEqual(getCustomerQuoteContent(quote).pricingTerms, quote.terms.pricingTerms.slice(1));
  assert.equal(JSON.stringify(quote), original);
  const saved = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.deepEqual(getCustomerQuoteContent(saved).pricingTerms, quote.terms.pricingTerms.slice(1));
  assert.equal(customerCopy(`Payment is due within 30 days. ${carryover} Annual subscriptions renew at the quoted rate.`), "Payment is due within 30 days.\nAnnual subscriptions renew at the quoted rate.");
});

test("new combined terms no longer insert internal commercial-assumption boilerplate", () => {
  const terms = buildTermsFromPackage("starlink_plus_integration");
  assert.ok(!terms.pricingTerms.some((line) => line.includes("commercial assumptions inside the same proposal")));
  assert.ok(terms.pricingTerms.includes("Pricing excludes taxes, tariffs, and out-of-scope civil works unless explicitly included."));
});

test("service terms and scope text also flag contradictory commitments", () => {
  const quote = customerQuote();
  quote.terms.generalStarlinkServiceTerms = ["The subscription commitment is 12 months."];
  assert.ok(getCustomerQuoteContent(quote).warnings.includes("The written service term differs from the subscription commitment."));
  quote.terms.generalStarlinkServiceTerms = [];
  quote.sections.sectionA.introText = "Service is provided under a 24-month commitment.";
  assert.equal(getCustomerQuoteContent(quote).approvalReady, false);
  quote.sections.sectionA.introText = "";
  quote.terms.generalStarlinkServiceTerms = ["The equipment lease lasts 3 months. The subscription commitment is 12 months."];
  assert.equal(getCustomerQuoteContent(quote).approvalReady, false);
});

test("Major field service confirmation persists and becomes stale when scope or pricing changes", () => {
  const quote = customerQuote();
  quote.metadata.workflowMode = "major_project";
  quote.sections.sectionC.enabled = true;
  quote.sections.sectionC.lineItems = [{ id: "install", sourceType: "custom", description: "Installation", quantity: 1, unitPrice: 50, totalPrice: 50, pricingStage: "budgetary" }];
  assert.equal(getCustomerQuoteContent(quote).fieldServicePricingConfirmed, false);
  quote.customerOutput = { ...normalizeCustomerOutput(quote.customerOutput), fieldServiceConfirmation: getFieldServiceConfirmationKey(quote) };
  const saved = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.equal(getCustomerQuoteContent(saved).fieldServicePricingConfirmed, true);
  assert.ok(!getCustomerQuoteContent(saved).warnings.includes("Implementation and service pricing is budgetary and subject to confirmation based on final site count, configuration, and deployment requirements."));
  saved.sections.sectionC.lineItems[0].totalPrice = 75;
  assert.equal(getCustomerQuoteContent(saved).fieldServicePricingConfirmed, false);
  assert.ok(getCustomerQuoteContent(saved).warnings.includes("Implementation and service pricing is budgetary and subject to confirmation based on final site count, configuration, and deployment requirements."));
  saved.sections.sectionC.lineItems[0].totalPrice = 50;
  saved.sections.sectionC.lineItems[0].description = "Two-site installation";
  assert.equal(getCustomerQuoteContent(saved).fieldServicePricingConfirmed, false);
});

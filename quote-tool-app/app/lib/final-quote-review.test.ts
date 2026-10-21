import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import { finalReviewComplete, finalReviewConfirmed, finalReviewKey, needsShippingActivation, setFinalPaymentTerms } from "./final-quote-review";
import { getCustomerQuoteContent, normalizeCustomerOutput } from "./proposal-customer-content";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { buildTermsFromPackage } from "./terms-packages";
import { applyMajorProjectToQuote } from "./major-project";
import { buildOrderProcessingText, getOrderProcessing } from "./order-processing";
import { normalizeProcessingRequirements } from "./processing-requirements";

test("final answers replace default payment copy and survive saving and package changes", () => {
  const quote = createBlankQuoteRecord();
  setFinalPaymentTerms(quote, "Net 60");
  quote.customerOutput = { ...normalizeCustomerOutput(quote.customerOutput), billingStart: "On installation" };
  quote.sections.sectionA.termMonths = 24;
  quote.customerOutput.commercialConfirmation = finalReviewKey(quote);
  assert.equal(finalReviewConfirmed(quote), true);
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  assert.equal(finalReviewConfirmed(restored), true);
  restored.terms = buildTermsFromPackage("starlink_only");
  const content = getCustomerQuoteContent(restored);
  assert.ok(content.pricingTerms.includes("Payment terms: Net 60"));
  assert.ok(!content.pricingTerms.some(line => /Net 30/i.test(line)));
  assert.equal(content.settings.billingStart, "On installation");
  assert.equal(content.serviceTermMonths, 24);
  assert.equal(finalReviewConfirmed(restored), false);
});

test("shipping activation is conditional, explicit, and included in customer and order output", () => {
  const quote = createBlankQuoteRecord();
  setFinalPaymentTerms(quote, "Prepaid");
  quote.customerOutput!.billingStart = "On activation";
  assert.equal(needsShippingActivation(quote), false);
  quote.sections.sectionB.enabled = true;
  quote.sections.sectionB.lineItems = [{ id: "kit", sourceType: "custom", itemName: "Terminal", quantity: 1, unitPrice: 500, totalPrice: 500 }];
  quote.customer.name = "Test customer";
  quote.customer.contactName = "Test contact";
  quote.customer.contactPhone = "555-0100";
  quote.customer.addressLines = ["Test service address"];
  quote.shippingSameAsBillTo = false;
  quote.shipTo = { companyName: "Test customer", attention: "Test contact", lines: ["Test shipping address"] };
  quote.orderProcessing = getOrderProcessing(quote);
  quote.orderProcessing!.shippingRequired = "yes";
  quote.orderProcessing!.shippingContactPhone = "555-0100";
  quote.orderProcessing!.notes = "None";
  quote.orderProcessing!.requirements = { ...normalizeProcessingRequirements(undefined), subAccountStatus: "no" };
  assert.equal(needsShippingActivation(quote), true);
  assert.equal(finalReviewComplete(quote), false);
  for (const choice of ["yes", "no"] as const) {
    quote.customerOutput!.shipsActivated = choice;
    const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
    assert.equal(finalReviewComplete(restored), true);
    assert.ok(getCustomerQuoteContent(restored).pricingTerms.includes(choice === "yes" ? "Equipment will ship activated." : "Equipment will ship unactivated."));
    assert.ok(buildOrderProcessingText(restored).includes(`Ship activated: ${choice === "yes" ? "Yes" : "No"}`));
  }
  quote.orderProcessing!.shippingRequired = "no";
  assert.equal(needsShippingActivation(quote), false);
  assert.ok(!getCustomerQuoteContent(quote).pricingTerms.some(line => /will ship/i.test(line)));
});

test("major project application preserves final terms and edited answers invalidate confirmation", () => {
  const quote = createBlankQuoteRecord();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.enabled = true;
  quote.majorProject.commercial.termMonths = 36;
  setFinalPaymentTerms(quote, "50% deposit; balance before shipment");
  quote.customerOutput!.billingStart = "On installation";
  quote.majorProject.summary.billingStart = "On installation";
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  const applied = applyMajorProjectToQuote(quote);
  assert.equal(applied.sections.sectionA.termMonths, 36);
  assert.equal(applied.majorProject.summary.paymentTerms, quote.customerOutput!.paymentTerms);
  assert.equal(finalReviewConfirmed(applied), true);
  applied.customerOutput!.billingStart = "On activation";
  assert.equal(finalReviewConfirmed(applied), false);
  applied.majorProject.commercial.termMonths = 0;
  assert.equal(finalReviewComplete(applied), false);
});

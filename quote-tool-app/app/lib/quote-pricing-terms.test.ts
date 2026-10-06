import assert from "node:assert/strict";
import test from "node:test";
import { createBlankQuoteRecord } from "./quote-template";
import { resolveQuotePricingTerms } from "./quote-pricing-terms";
import { getCustomerQuoteContent } from "./proposal-customer-content";
import { buildProposalPdfViewModel } from "./proposal-pdf";
import { deserializeQuoteRecord, serializeQuoteRecord } from "./proposal-state";
import { finalReviewConfirmed, finalReviewKey, setFinalPaymentTerms } from "./final-quote-review";

test("the legacy body follows selected terms in the editor, HTML, and PDF model", () => {
  const quote = createBlankQuoteRecord();
  quote.sections.sectionA.enabled = true;
  quote.sections.sectionA.mode = "per_kit";
  quote.sections.sectionA.perKitRows = [{ id: "service", rowType: "service", description: "Connectivity", quantity: 1, monthlyRate: 100, totalMonthlyRate: 100 }];
  quote.sections.sectionA.termMonths = 24;
  quote.metadata.expirationDate = "November 15, 2026";
  quote.metadata.currencyCode = "CAD";
  setFinalPaymentTerms(quote, "Net 60");
  const restored = deserializeQuoteRecord(serializeQuoteRecord(quote))!;
  for (const lines of [resolveQuotePricingTerms(restored), getCustomerQuoteContent(restored).pricingTerms, buildProposalPdfViewModel(restored).terms.pricingTerms]) {
    assert.ok(lines.includes("Recurring service pricing is based on a 24-month subscription commitment."));
    assert.ok(lines.includes("Payment terms: Net 60"));
    assert.ok(lines.includes("This quote is valid through November 15, 2026."));
    assert.ok(lines.includes("Pricing is in CAD."));
    assert.ok(!lines.some(line => /12 Month Term|NET 30|US Dollars|valid for 30 days/i.test(line)));
    assert.ok(lines.includes("Starlink reserves the right to modify its pricing at any time with 30 days’ notice prior to the change taking effect."));
    assert.ok(lines.includes("Shipping is FOB unless otherwise stated in this proposal."));
  }
});

test("saved generated wording updates again while separately authored clauses survive", () => {
  const quote = createBlankQuoteRecord();
  quote.terms.pricingTerms.push("Custom service agreement requires a 48 month commitment.");
  quote.terms.pricingTerms = resolveQuotePricingTerms(quote);
  quote.sections.sectionA.termMonths = 36;
  quote.metadata.expirationDate = "December 1, 2026";
  const lines = resolveQuotePricingTerms(quote);
  assert.ok(lines.includes("Recurring service pricing is based on a 36-month subscription commitment."));
  assert.ok(lines.includes("This quote is valid through December 1, 2026."));
  assert.ok(lines.includes("Custom service agreement requires a 48 month commitment."));
});

test("major project term is used before projection and changed expiry requires confirmation", () => {
  const quote = createBlankQuoteRecord();
  quote.metadata.workflowMode = "major_project";
  quote.majorProject.commercial.termMonths = 36;
  setFinalPaymentTerms(quote, "Prepaid");
  quote.customerOutput!.billingStart = "On activation";
  quote.customerOutput!.commercialConfirmation = finalReviewKey(quote);
  assert.equal(finalReviewConfirmed(quote), true);
  assert.ok(resolveQuotePricingTerms(quote).some(line => line.includes("36-month")));
  quote.metadata.expirationDate = "December 1, 2026";
  assert.equal(finalReviewConfirmed(quote), false);
});

import type { QuoteRecord } from "./quote-record";
import { normalizeCustomerOutput } from "./proposal-customer-content";
import { getIncludedEquipmentRows } from "./proposal-commercial-summary";
import { resolveQuotePricingTerms } from "./quote-pricing-terms";

export function needsShippingActivation(quote: QuoteRecord) {
  return quote.orderProcessing?.shippingRequired !== "no" && getIncludedEquipmentRows(quote).length > 0;
}

export function getFinalPaymentTerms(quote: QuoteRecord) {
  return quote.customerOutput?.paymentTerms ?? quote.terms.pricingTerms.find(line => /^payment terms?\b/i.test(line.trim()))?.replace(/^payment terms?\s*(?:are\s+|:\s*)?/i, "")
    ?? (quote.metadata.workflowMode === "major_project" ? quote.majorProject.summary.paymentTerms : "");
}

export function setFinalPaymentTerms(quote: QuoteRecord, value: string) {
  quote.customerOutput = { ...normalizeCustomerOutput(quote.customerOutput), paymentTerms: value };
  quote.terms.pricingTerms = quote.terms.pricingTerms.filter(line => !/^payment terms?\b/i.test(line.trim()));
  if (value.trim()) quote.terms.pricingTerms.push(`Payment terms: ${value}`);
  if (quote.metadata.workflowMode === "major_project") quote.majorProject.summary.paymentTerms = value;
  return quote;
}

export function finalReviewKey(quote: QuoteRecord) {
  return JSON.stringify({
    term: quote.metadata.workflowMode === "major_project" ? quote.majorProject.commercial.termMonths : quote.sections.sectionA.termMonths,
    payment: getFinalPaymentTerms(quote).trim(),
    billing: quote.customerOutput?.billingStart?.trim() ?? "",
    activation: needsShippingActivation(quote) ? quote.customerOutput?.shipsActivated ?? "" : null,
    lease: quote.metadata.quoteType === "lease" ? [quote.metadata.leaseTermMonths, quote.customerOutput?.leaseEndTerms, quote.customerOutput?.postLeaseTerms] : null,
    terms: { ...quote.terms, pricingTerms: resolveQuotePricingTerms(quote) },
    project: quote.metadata.workflowMode === "major_project" ? [quote.majorProject.summary.paymentTerms, quote.majorProject.summary.billingStart] : null,
  });
}

export function finalReviewComplete(quote: QuoteRecord) {
  const months = quote.metadata.workflowMode === "major_project" ? quote.majorProject.commercial.termMonths : quote.sections.sectionA.termMonths;
  return Number.isInteger(months) && months > 0 && Boolean(getFinalPaymentTerms(quote).trim())
    && Boolean(quote.customerOutput?.billingStart?.trim())
    && (!needsShippingActivation(quote) || ["yes", "no"].includes(quote.customerOutput?.shipsActivated ?? ""));
}

export function finalReviewConfirmed(quote: QuoteRecord) {
  return finalReviewComplete(quote) && quote.customerOutput?.commercialConfirmation === finalReviewKey(quote);
}

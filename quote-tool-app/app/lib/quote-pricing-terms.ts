import type { QuoteRecord } from "./quote-record";

export function isManagedServiceTerm(line: string) {
  return line === "Pricing for Pool for Starlink Service is based upon a 12 Month Term upon date of agreement between both parties."
    || /^Recurring service pricing is based on a \d+-month subscription commitment\.$/.test(line)
    || line === "Recurring service commitment is to be confirmed.";
}

/** Resolve template defaults from the quote; leave independently authored clauses intact. */
export function resolveQuotePricingTerms(quote: QuoteRecord) {
  const months = quote.metadata.workflowMode === "major_project" ? quote.majorProject.commercial.termMonths : quote.sections.sectionA.termMonths;
  const payment = quote.customerOutput?.paymentTerms?.trim();
  const expiration = quote.metadata.expirationDate?.trim();
  const currency = quote.metadata.currencyCode?.trim() || "USD";
  let paymentWritten = false;
  const lines = quote.terms.pricingTerms.flatMap(value => {
    const line = value.trim();
    if (isManagedServiceTerm(line)) {
      return [Number.isInteger(months) && months > 0
        ? `Recurring service pricing is based on a ${months}-month subscription commitment.`
        : "Recurring service commitment is to be confirmed."];
    }
    if (expiration && (/^This quote is valid for 30 days from (?:the proposal )?creation date(?: unless stated otherwise)?\.$/i.test(line)
      || /^This quote is valid through .+\.$/.test(line))) {
      return [`This quote is valid through ${expiration}.`];
    }
    if (/^Pricing is in (?:US Dollars|[A-Z]{3})\.$/.test(line)) return [`Pricing is in ${currency}.`];
    if (payment && /^payment terms?\b/i.test(line)) {
      if (paymentWritten) return [];
      paymentWritten = true;
      return [`Payment terms: ${payment}`];
    }
    return [value];
  });
  if (payment && !paymentWritten) lines.push(`Payment terms: ${payment}`);
  return lines;
}

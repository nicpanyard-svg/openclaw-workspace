import type { QuoteRecord } from "../lib/quote-record";
import { getOveragePlan, resolveOverageTerms } from "../lib/overage-terms";
import { formatQuoteLinePrice, getMappedQuotePriceStatus } from "../lib/quote-price-status";

export function OverageDisclosure({ quote }: { quote: QuoteRecord }) {
  const terms = resolveOverageTerms(quote);
  const a = quote.sections.sectionA;
  const rows = a.enabled ? (a.mode === "pool" ? a.poolRows : a.perKitRows).filter(row => row.rowType === "overage" && !row.optional) : [];
  const source = { unitPrice: terms.amount, usageBased: true, ...(rows.length ? { priceStatus: getMappedQuotePriceStatus({}, rows) } : {}) };
  const rate = terms.amount !== null && !terms.conflict && !terms.planMismatch && terms.basis.trim()
    ? `${formatQuoteLinePrice(source, new Intl.NumberFormat("en-US", { style: "currency", currency: quote.metadata.currencyCode || "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(terms.amount))} ${terms.basis}`
    : "To be confirmed";
  return <section className="cp-section cp-overages" aria-label="Overage pricing">
    <h2>Usage-based overages</h2>
    <p><strong>Overage election:</strong> {terms.decision === "yes" ? "Opted in" : terms.decision === "no" ? "Opted out" : "Not confirmed"}.</p>
    {terms.decision === "yes" && <><p><strong>Overage rate: {rate}</strong></p><p>{getOveragePlan(quote) === "pool" ? "Billed per GB used above the included pool allowance." : "Billed per additional 50GB block above the included data allowance."} Not included in the quoted monthly, one-time, or annual totals.</p></>}
    {terms.decision === "no" && <p>Overage charges are not authorized.</p>}
  </section>;
}

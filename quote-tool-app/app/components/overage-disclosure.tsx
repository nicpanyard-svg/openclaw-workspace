import type { QuoteRecord } from "../lib/quote-record";
import { resolveOverageTerms } from "../lib/overage-terms";

export function OverageDisclosure({ quote }: { quote: QuoteRecord }) {
  const terms = resolveOverageTerms(quote);
  const rate = terms.amount !== null && !terms.conflict && terms.basis.trim()
    ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: quote.metadata.currencyCode || "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(terms.amount)} ${terms.basis}`
    : "To be confirmed";
  return <section className="cp-section cp-overages" aria-label="Overage pricing">
    <h2>Usage-based overages</h2>
    <p><strong>Overage election:</strong> {terms.decision === "yes" ? "Opted in" : terms.decision === "no" ? "Opted out" : "Not confirmed"}.</p>
    {terms.decision === "yes" && <><p><strong>Overage rate: {rate}</strong></p><p>Billed only for usage above the included data allowance. Not included in the quoted monthly, one-time, or annual totals.</p></>}
    {terms.decision === "no" && <p>Overage charges are not authorized.</p>}
  </section>;
}

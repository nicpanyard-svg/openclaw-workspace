"use client";

import type { QuoteRecord } from "../lib/quote-record";
import { getOrderProcessing } from "../lib/order-processing";
import { resolveOverageTerms, setOveragePrice } from "../lib/overage-terms";
import { normalizeProcessingRequirements, prefillStarlinkRates } from "../lib/processing-requirements";

export function OveragePricingFields({ quote, onChange }: {
  quote: QuoteRecord;
  onChange: (updater: (quote: QuoteRecord) => QuoteRecord) => void;
}) {
  const terms = resolveOverageTerms(quote);
  const prepare = (draft: QuoteRecord) => {
    draft.orderProcessing = getOrderProcessing(draft);
    return draft;
  };
  const updatePrice = (amount: number | null, basis = terms.basis) =>
    onChange(draft => setOveragePrice(prepare(draft), amount, basis));
  return <fieldset className="rq-order-section">
    <legend>Overage charges</legend>
    <div className="rq-detail-fields">
      <label className="builder-field"><span>Opt in or out of overages</span><select required value={terms.decision} onChange={event => {
        const decision = event.target.value as "pending" | "yes" | "no";
        onChange(draft => {
          prepare(draft);
          draft.orderProcessing!.overageOptIn = decision;
          if (decision !== "yes" || terms.conflict) return draft;
          if (terms.amount !== null) return setOveragePrice(draft, terms.amount, terms.basis);
          if (draft.orderProcessing!.requirements!.rates.overages.status !== "pending") return draft;
          const rate = prefillStarlinkRates(normalizeProcessingRequirements(undefined)).rates.overages;
          return setOveragePrice(draft, rate.amount, rate.basis);
        });
      }}><option value="pending">Choose opt in or opt out</option><option value="yes">Opt in — set the overage price</option><option value="no">Opt out — no overage charges</option></select></label>
      {terms.decision === "yes" && <>
        <label className="builder-field"><span>Overage price ({quote.metadata.currencyCode || "USD"})</span><input required type="number" min="0" step="0.01" value={terms.amount ?? ""} onChange={event => updatePrice(event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label className="builder-field"><span>Overage billing unit</span><input required value={terms.basis.replace(/^per\s+/i, "")} placeholder="GB" onChange={event => updatePrice(terms.amount, event.target.value.trim() ? `per ${event.target.value}` : "")} /></label>
      </>}
    </div>
    {terms.decision === "yes" && <p>Confirm or edit the overage rate. The customer will see it as a usage-based charge, excluded from the quote totals.</p>}
    {terms.decision === "yes" && terms.conflict && <div role="alert" className="rq-setup-error"><p>The saved overage prices differ. Enter the agreed rate above, or confirm the displayed rate.</p><button type="button" className="rq-button" disabled={terms.amount === null || !terms.basis.trim()} onClick={() => updatePrice(terms.amount)}>Use this overage rate</button></div>}
    {terms.decision === "no" && <p>The customer is opted out of overage charges. Any saved rate is kept for later.</p>}
  </fieldset>;
}

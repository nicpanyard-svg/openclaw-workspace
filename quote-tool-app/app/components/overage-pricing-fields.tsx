"use client";

import { hasStarlinkService } from "../lib/starlink-service";
import type { QuoteRecord } from "../lib/quote-record";
import { getOrderProcessing } from "../lib/order-processing";
import { getOverageDefault, getOveragePlan, resolveOverageTerms, setOveragePrice } from "../lib/overage-terms";

export function OveragePricingFields({ quote, onChange }: {
  quote: QuoteRecord;
  onChange: (updater: (quote: QuoteRecord) => QuoteRecord) => void;
}) {
  if (!hasStarlinkService(quote)) return null;
  const terms = resolveOverageTerms(quote);
  const standard = getOverageDefault(quote);
  const pool = getOveragePlan(quote) === "pool";
  const needsUnitCorrection = terms.planMismatch || (terms.amount !== null && !terms.basis.trim());
  const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: quote.metadata.currencyCode || "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);
  const prepare = (draft: QuoteRecord) => {
    draft.orderProcessing = getOrderProcessing(draft);
    return draft;
  };
  const updatePrice = (amount: number | null) =>
    onChange(draft => setOveragePrice(prepare(draft), amount, getOverageDefault(draft).basis));
  return <fieldset className="rq-order-section">
    <legend>Overage charges</legend>
    <div className="rq-detail-fields">
      <label className="builder-field"><span>Opt in or out of overages</span><select required value={terms.decision} onChange={event => {
        const decision = event.target.value as "pending" | "yes" | "no";
        onChange(draft => {
          prepare(draft);
          draft.orderProcessing!.overageOptIn = decision;
          if (decision !== "yes" || terms.conflict || needsUnitCorrection) return draft;
          if (terms.amount !== null) return setOveragePrice(draft, terms.amount, terms.basis);
          if (draft.orderProcessing!.requirements!.rates.overages.status !== "pending") return draft;
          const rate = getOverageDefault(draft);
          return setOveragePrice(draft, rate.amount, rate.basis);
        });
      }}><option value="pending">Choose opt in or opt out</option><option value="yes">Opt in — set the overage price</option><option value="no">Opt out — no overage charges</option></select></label>
      {terms.decision === "yes" && <>
        <label className="builder-field"><span>Overage price ({quote.metadata.currencyCode || "USD"})</span><input required type="number" min="0" step="0.01" value={needsUnitCorrection ? "" : terms.amount ?? ""} onChange={event => updatePrice(event.target.value === "" ? null : Number(event.target.value))} /></label>
        <label className="builder-field"><span>Overage billing unit</span><input readOnly value={standard.basis} /></label>
      </>}
    </div>
    {terms.decision === "yes" && <p>{pool ? "Pool overages are billed per GB." : "Block plan overages are billed per additional 50GB block."} Confirm or edit the price. The customer will see this rate separately, excluded from the quote totals.</p>}
    {terms.decision === "yes" && needsUnitCorrection && <div role="alert" className="rq-setup-error"><p>The saved overage rate{terms.amount !== null ? ` (${money(terms.amount)}${terms.basis ? ` ${terms.basis}` : ""})` : ` (${terms.basis})`} {terms.basis ? "uses a different billing unit" : "is missing its billing unit"}. Enter the price {standard.basis} above, or use the standard rate.</p><button type="button" className="rq-button" onClick={() => updatePrice(standard.amount)}>Use standard rate: {money(standard.amount)} {standard.basis}</button></div>}
    {terms.decision === "yes" && terms.conflict && !needsUnitCorrection && <div role="alert" className="rq-setup-error"><p>The saved overage prices differ. Enter the agreed rate above, or confirm the displayed rate.</p><button type="button" className="rq-button" disabled={terms.amount === null || !terms.basis.trim()} onClick={() => updatePrice(terms.amount)}>Use this overage rate</button></div>}
    {terms.decision === "no" && <p>The customer is opted out of overage charges. Any saved rate is kept for later.</p>}
  </fieldset>;
}

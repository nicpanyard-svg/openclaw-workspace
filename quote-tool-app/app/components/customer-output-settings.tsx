"use client";

import type { QuoteCustomerOutput, QuoteRecord } from "@/app/lib/quote-record";
import { getCustomerQuoteContent, getFieldServiceConfirmationKey, normalizeCustomerOutput } from "@/app/lib/proposal-customer-content";
import { getIncludedServiceRows } from "@/app/lib/proposal-commercial-summary";

export function CustomerOutputSettings({ quote, onChange }: {
  quote: QuoteRecord;
  onChange: (updater: (quote: QuoteRecord) => QuoteRecord) => void;
}) {
  const settings = { ...normalizeCustomerOutput(quote.customerOutput), ...quote.customerOutput };
  const update = (key: keyof QuoteCustomerOutput, value: string) => onChange((draft) => {
    draft.customerOutput = { ...normalizeCustomerOutput(draft.customerOutput), [key]: value };
    return draft;
  });
  return <section className="builder-panel">
    <div className="rq-section-heading"><h2>Customer commercial details</h2></div>
    <div className="rq-detail-fields">
      {quote.sections.sectionA.enabled && quote.metadata.workflowMode !== "major_project" && <label className="builder-field"><span>Subscription commitment (months)</span><input type="number" min="1" step="1" value={quote.sections.sectionA.termMonths} onChange={(event) => onChange((draft) => { draft.sections.sectionA.termMonths = Math.max(1, Math.floor(Number(event.target.value) || 1)); return draft; })} /></label>}
      <label className="builder-field"><span>Billing begins</span><input value={settings.billingStart} onChange={(event) => update("billingStart", event.target.value)} /></label>
      <label className="builder-field"><span>Delivery / lead time</span><input value={settings.deliveryLeadTime} onChange={(event) => update("deliveryLeadTime", event.target.value)} /></label>
      {quote.metadata.quoteType === "lease" && <>
        <label className="builder-field"><span>Equipment at end of lease</span><textarea rows={2} value={settings.leaseEndTerms} onChange={(event) => update("leaseEndTerms", event.target.value)} /></label>
        <label className="builder-field"><span>Pricing after equipment lease</span><textarea rows={2} value={settings.postLeaseTerms} onChange={(event) => update("postLeaseTerms", event.target.value)} /></label>
      </>}
    </div>
    {quote.metadata.workflowMode === "major_project" && getIncludedServiceRows(quote).length > 0 && <label className="builder-toggle mt-4">
      <input type="checkbox" checked={getCustomerQuoteContent(quote).fieldServicePricingConfirmed} onChange={(event) => {
        const confirmed = event.target.checked;
        onChange((draft) => {
          draft.customerOutput = { ...normalizeCustomerOutput(draft.customerOutput), fieldServiceConfirmation: confirmed ? getFieldServiceConfirmationKey(draft) : undefined };
          return draft;
        });
      }} />
      <span>Field service scope and prices confirmed</span>
    </label>}
  </section>;
}

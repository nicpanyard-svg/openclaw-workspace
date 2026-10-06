"use client";

import { useState } from "react";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { getCustomerQuoteContent, getFieldServiceConfirmationKey, normalizeCustomerOutput } from "@/app/lib/proposal-customer-content";
import { getIncludedServiceRows } from "@/app/lib/proposal-commercial-summary";
import { finalReviewComplete, finalReviewConfirmed, finalReviewKey, getFinalPaymentTerms, needsShippingActivation, setFinalPaymentTerms } from "@/app/lib/final-quote-review";
import { OveragePricingFields } from "./overage-pricing-fields";

const PAYMENT_TERMS_OPTIONS = ["Net 30", "Net 60", "Prepaid"];

function PaymentTermsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [editingCustom, setEditingCustom] = useState(false);
  const legacyNet30 = /^net 30(?: days from invoice date unless stated otherwise in Master Service Agreement| unless otherwise stated in the governing agreement)\.$/i.test(value.trim());
  const preset = legacyNet30 ? "Net 30" : PAYMENT_TERMS_OPTIONS.find(option => option.toLowerCase() === value.trim().toLowerCase());
  const custom = editingCustom || Boolean(value && !preset);

  return <div className="builder-field">
    <label className="builder-field">
      <span>What are the payment terms?</span>
      <select value={custom ? "custom" : preset ?? ""} onChange={event => {
        const selected = event.target.value;
        setEditingCustom(selected === "custom");
        if (selected !== "custom") onChange(selected);
      }}>
        <option value="" disabled>Choose payment terms</option>
        {PAYMENT_TERMS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        <option value="custom">Custom terms</option>
      </select>
    </label>
    {custom && <label className="builder-field">
      <span>Custom terms</span>
      <input value={value} onChange={event => onChange(event.target.value)} placeholder="Enter the agreed payment terms" />
    </label>}
  </div>;
}

export function CustomerOutputSettings({ quote, onChange }: {
  quote: QuoteRecord;
  onChange: (updater: (quote: QuoteRecord) => QuoteRecord) => void;
}) {
  const settings = { ...normalizeCustomerOutput(quote.customerOutput), ...quote.customerOutput };
  const update = (key: "billingStart" | "deliveryLeadTime" | "leaseEndTerms" | "postLeaseTerms", value: string) => onChange((draft) => {
    draft.customerOutput = { ...normalizeCustomerOutput(draft.customerOutput), [key]: value };
    if (key === "billingStart" && draft.metadata.workflowMode === "major_project") draft.majorProject.summary.billingStart = value;
    return draft;
  });
  return <section className="builder-panel">
    <div className="rq-section-heading"><h2>Confirm quote details</h2></div>
    <p>Check these answers before creating the customer proposal.</p>
    <div className="rq-detail-fields">
      <label className="builder-field"><span>How long is the agreement? (months)</span><input type="number" min="1" step="1" list="review-agreement-months" value={(quote.metadata.workflowMode === "major_project" ? quote.majorProject.commercial.termMonths : quote.sections.sectionA.termMonths) || ""} onChange={(event) => onChange((draft) => {
        const months = Number(event.target.value);
        draft.sections.sectionA.termMonths = months;
        if (draft.metadata.workflowMode === "major_project") draft.majorProject.commercial.termMonths = months;
        return draft;
      })} /><datalist id="review-agreement-months"><option value="12" /><option value="24" /><option value="36" /></datalist></label>
      <PaymentTermsField key={quote.internal.quoteId} value={getFinalPaymentTerms(quote)} onChange={value => onChange(draft => setFinalPaymentTerms(draft, value))} />
      <label className="builder-field"><span>When does billing start?</span><input list="review-billing-start" value={settings.billingStart} onChange={(event) => update("billingStart", event.target.value)} placeholder="Choose or enter a date" /><datalist id="review-billing-start"><option value="On activation" /><option value="On installation" /></datalist></label>
      {needsShippingActivation(quote) && <label className="builder-field"><span>Should the equipment ship activated?</span><select value={settings.shipsActivated ?? ""} onChange={event => onChange(draft => {
        draft.customerOutput = { ...normalizeCustomerOutput(draft.customerOutput), shipsActivated: event.target.value === "yes" ? "yes" : event.target.value === "no" ? "no" : undefined };
        return draft;
      })}><option value="">Choose an answer</option><option value="yes">Yes — ship activated</option><option value="no">No — ship unactivated</option></select></label>}
    </div>
    <details className="rq-disclosure mt-4"><summary>Optional details</summary>
    <div className="rq-detail-fields">
      <label className="builder-field"><span>Quote expiration</span><input value={quote.metadata.expirationDate ?? ""} onChange={event => onChange(draft => { draft.metadata.expirationDate = event.target.value; return draft; })} /></label>
      <label className="builder-field"><span>Delivery / lead time</span><input value={settings.deliveryLeadTime} onChange={(event) => update("deliveryLeadTime", event.target.value)} /></label>
      {quote.metadata.quoteType === "lease" && <>
        <label className="builder-field"><span>Equipment lease term</span><select value={quote.metadata.leaseTermMonths ?? 12} onChange={event => onChange(draft => { draft.metadata.leaseTermMonths = Number(event.target.value) as 3 | 6 | 9 | 12 | 24 | 36; return draft; })}>{[3, 6, 9, 12, 24, 36].map(months => <option key={months} value={months}>{months} months</option>)}</select></label>
        <label className="builder-field"><span>Equipment at end of lease</span><textarea rows={2} value={settings.leaseEndTerms} onChange={(event) => update("leaseEndTerms", event.target.value)} /></label>
        <label className="builder-field"><span>Pricing after equipment lease</span><textarea rows={2} value={settings.postLeaseTerms} onChange={(event) => update("postLeaseTerms", event.target.value)} /></label>
      </>}
    </div>
    <OveragePricingFields quote={quote} onChange={onChange} />
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
    </details>
    <label className="builder-toggle mt-4"><input type="checkbox" checked={finalReviewConfirmed(quote)} disabled={!finalReviewComplete(quote)} onChange={event => {
      const confirmed = event.target.checked;
      onChange(draft => {
        setFinalPaymentTerms(draft, getFinalPaymentTerms(draft));
        draft.customerOutput = { ...normalizeCustomerOutput(draft.customerOutput), commercialConfirmation: confirmed ? finalReviewKey(draft) : undefined };
        return draft;
      });
    }} /><span>I confirm these quote details</span></label>
    {!finalReviewComplete(quote) && <p>Answer the questions above to confirm. You can save a draft at any time.</p>}
  </section>;
}

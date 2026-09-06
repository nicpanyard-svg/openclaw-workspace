"use client";

import { AlertCircle, Check, Download, Pencil } from "lucide-react";
import type { QuoteOrderProcessing, QuoteRecord } from "@/app/lib/quote-record";
import { getOrderProcessing, getOrderProcessingSummary } from "@/app/lib/order-processing";

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

type OrderProcessingPanelProps = {
  quote: QuoteRecord;
  onChange: (updater: (quote: QuoteRecord) => QuoteRecord) => void;
  onEditCustomer: () => void;
  onEditItems: () => void;
  onExport: () => void;
};

export function OrderProcessingPanel({ quote, onChange, onEditCustomer, onEditItems, onExport }: OrderProcessingPanelProps) {
  const summary = getOrderProcessingSummary(quote);
  const details = { ...getOrderProcessing(quote), ...quote.orderProcessing };
  const currency = quote.metadata.currencyCode || "USD";
  const updateDetails = (patch: Partial<QuoteOrderProcessing>) => onChange((draft) => {
    draft.orderProcessing = { ...getOrderProcessing(draft), ...patch };
    return draft;
  });

  return <section className="builder-panel rq-order-panel">
    <div className="rq-section-heading">
      <div><h2>Order processing</h2><span className="rq-internal-label">Internal handoff</span></div>
      <button type="button" className="rq-button" onClick={onExport}><Download size={16} aria-hidden="true" />{summary.missingFields.length ? "Download draft summary" : "Download order summary"}</button>
    </div>
    {summary.missingFields.length > 0 ? <details className="rq-order-checklist" open>
      <summary><AlertCircle size={16} aria-hidden="true" />{summary.missingFields.length} order details to confirm</summary>
      <ul>{summary.missingFields.map((item) => <li key={item}>{item}</li>)}</ul>
    </details> : <p className="rq-ready"><Check size={16} aria-hidden="true" />Order details complete</p>}

    <div className="rq-order-section">
      <div className="rq-section-heading"><h3>Service location and terminals</h3><button type="button" className="rq-button rq-button-quiet" onClick={onEditCustomer}><Pencil size={14} aria-hidden="true" />Edit customer</button></div>
      <div className="rq-order-address"><span>Service address</span>{summary.serviceAddress.length ? summary.serviceAddress.map((line, index) => <div key={index}>{line}</div>) : <strong>Not specified</strong>}</div>
      <div className="rq-detail-fields">
        <label className="builder-field"><span>Terminal names / identifiers</span><select value={details.terminalsStatus} onChange={(event) => updateDetails({ terminalsStatus: event.target.value as QuoteOrderProcessing["terminalsStatus"] })}><option value="pending">Not confirmed</option><option value="listed">Listed below</option><option value="not_applicable">Not applicable</option></select></label>
        {details.terminalsStatus === "listed" && <label className="builder-field"><span>Terminal list</span><textarea rows={3} value={details.terminals.join("\n")} onChange={(event) => updateDetails({ terminals: event.target.value.split("\n") })} placeholder="Site A - Terminal 1" /></label>}
      </div>
    </div>

    <div className="rq-order-section">
      <div className="rq-section-heading"><h3>Shipping</h3><button type="button" className="rq-button rq-button-quiet" onClick={onEditCustomer}><Pencil size={14} aria-hidden="true" />Edit address / contact</button></div>
      <div className="rq-detail-fields">
        <label className="builder-field"><span>Shipping required?</span><select value={details.shippingRequired} onChange={(event) => updateDetails({ shippingRequired: event.target.value as QuoteOrderProcessing["shippingRequired"] })}><option value="pending">Not confirmed</option><option value="yes">Yes</option><option value="no">No shipping needed</option></select></label>
        {details.shippingRequired !== "no" && <label className="builder-field"><span>Shipping contact phone</span><input type="tel" value={details.shippingContactPhone} onChange={(event) => updateDetails({ shippingContactPhone: event.target.value })} /></label>}
      </div>
      {details.shippingRequired !== "no" && <div className="rq-order-address"><span>Ship to{quote.shippingSameAsBillTo ? " / same as bill to" : ""}</span><strong>{summary.shippingContactName || "Contact name not specified"}</strong>{summary.shippingAddress.length ? summary.shippingAddress.map((line, index) => <div key={index}>{line}</div>) : <div>Shipping address not specified</div>}</div>}
    </div>

    <div className="rq-order-section">
      <div className="rq-section-heading"><h3>Subscriptions</h3><button type="button" className="rq-button rq-button-quiet" onClick={onEditItems}><Pencil size={14} aria-hidden="true" />Edit line items</button></div>
      <div className="rq-order-table-wrap"><table className="rq-order-table"><caption className="sr-only">Subscriptions and quoted fees</caption><thead><tr><th>Subscription / fee</th><th>Unit rate</th><th>Quoted total</th></tr></thead><tbody>{summary.subscriptionRows.length ? summary.subscriptionRows.map((row) => <tr key={row.id}><td><strong>{row.description}</strong><span>{row.kind}{row.quantity != null ? ` / Qty ${row.quantity}` : ""}</span></td><td>{formatCurrency(row.unitPrice, currency)}<span>{row.billingLabel}</span></td><td>{formatCurrency(row.total, currency)}</td></tr>) : <tr><td colSpan={3}>No subscriptions quoted.</td></tr>}</tbody></table></div>
      <div className="rq-detail-fields">
        <label className="builder-field"><span>Data plan / allocation</span><input value={details.dataPlanDetails} onChange={(event) => updateDetails({ dataPlanDetails: event.target.value })} placeholder="Pool / 1 TB across 4 terminals" /></label>
        <label className="builder-field"><span>Monitoring &amp; support arrangement</span><input value={details.monitoringSupportDetails} onChange={(event) => updateDetails({ monitoringSupportDetails: event.target.value })} placeholder="Quoted, included, or not applicable" /></label>
        <label className="builder-field"><span>Terminal access fee (TAF) arrangement</span><input value={details.terminalAccessFeeDetails} onChange={(event) => updateDetails({ terminalAccessFeeDetails: event.target.value })} placeholder="Quoted, included, or not applicable" /></label>
        <label className="builder-field"><span>Opted into overages?</span><select value={details.overageOptIn} onChange={(event) => updateDetails({ overageOptIn: event.target.value as QuoteOrderProcessing["overageOptIn"] })}><option value="pending">Not confirmed</option><option value="yes">Yes - opted in</option><option value="no">No - opted out</option><option value="not_applicable">Not applicable</option></select></label>
      </div>
    </div>

    <div className="rq-order-section">
      <div className="rq-section-heading"><h3>Equipment and charges</h3><button type="button" className="rq-button rq-button-quiet" onClick={onEditItems}><Pencil size={14} aria-hidden="true" />Edit line items</button></div>
      <div className="rq-order-table-wrap"><table className="rq-order-table"><caption className="sr-only">Equipment and field service charges</caption><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{summary.equipmentRows.map((row) => <tr key={row.id}><td><strong>{row.itemName}</strong>{quote.metadata.quoteType === "lease" && <span>Included in lease / pricing basis</span>}</td><td>{row.quantity}</td><td>{formatCurrency(row.unitPrice, currency)}</td><td>{formatCurrency(row.totalPrice, currency)}</td></tr>)}{summary.serviceRows.map((row) => <tr key={row.id}><td><strong>{row.description}</strong><span>One-time service</span></td><td>{row.quantity}</td><td>{formatCurrency(row.unitPrice, currency)}</td><td>{formatCurrency(row.totalPrice, currency)}</td></tr>)}{!summary.equipmentRows.length && !summary.serviceRows.length && <tr><td colSpan={4}>No equipment or one-time services quoted.</td></tr>}</tbody></table></div>
      <label className="builder-field"><span>Miscellaneous charge notes</span><textarea rows={2} value={details.miscellaneousChargesNotes} onChange={(event) => updateDetails({ miscellaneousChargesNotes: event.target.value })} placeholder="Freight, activation, or other quoted charges" /></label>
    </div>
    <label className="builder-field"><span>Other important order notes</span><textarea rows={3} value={details.notes} onChange={(event) => updateDetails({ notes: event.target.value })} /></label>
  </section>;
}

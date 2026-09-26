"use client";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Pencil } from "lucide-react";
import { applyMajorProjectToQuote } from "../lib/major-project";
import type { ProcessingRequirements, QuoteRecord } from "../lib/quote-record";
import { getOrderProcessing } from "../lib/order-processing";
import { getIncludedEquipmentRows } from "../lib/proposal-commercial-summary";
import { prefillStarlinkRates, requiredProcessingRates, normalizeProcessingRequirements } from "../lib/processing-requirements";
import { getQuoteSetupSteps, type QuoteSetupStepId } from "../lib/quote-setup";
import "./quote-setup.css";

export function ProcessingRequirementsForm({ quote: source, onChange, onEditItems, onEditCustomer, onComplete, blockedMessage, initialStep }: {
  quote: QuoteRecord;
  onChange: (updater: (quote: QuoteRecord) => QuoteRecord) => void;
  onEditItems: () => void;
  onEditCustomer: () => void;
  onComplete: () => void;
  blockedMessage?: string;
  initialStep?: number;
}) {
  const quote = useMemo(() => source.metadata.workflowMode === "major_project" && source.majorProject?.enabled ? applyMajorProjectToQuote(source) : source, [source]);
  const value = normalizeProcessingRequirements(quote.orderProcessing?.requirements);
  const steps = getQuoteSetupSteps(quote);
  const firstMissing = steps.findIndex(step => step.missing.length > 0);
  const [active, setActive] = useState(() => initialStep ?? (firstMissing < 0 ? 4 : firstMissing));
  const [attempted, setAttempted] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const current = steps[active];
  const rows = quote.sections.sectionB.enabled ? getIncludedEquipmentRows(quote) : [];
  const update = (patch: Partial<ProcessingRequirements>) => onChange(draft => { draft.orderProcessing = { ...getOrderProcessing(draft), requirements: { ...normalizeProcessingRequirements(draft.orderProcessing?.requirements), ...patch } }; return draft; });
  const updateOrder = (patch: Partial<NonNullable<QuoteRecord["orderProcessing"]>>) => onChange(draft => { draft.orderProcessing = { ...getOrderProcessing(draft), ...patch }; return draft; });
  const go = (index: number) => {
    setActive(index); setAttempted(false);
    window.setTimeout(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 0);
  };
  const next = () => {
    if (current.missing.length) {
      setAttempted(true);
      if (active === 4) { go(firstMissing); setAttempted(true); return; }
      window.setTimeout(() => {
        const field = [...(body.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea') || [])].find(field => field.value === "pending" || (field.required && !field.value.trim()));
        field?.focus();
      }, 0);
      return;
    }
    if (active < 4) go(active + 1);
    else if (blockedMessage) onEditItems();
    else onComplete();
  };
  const summaries: Record<QuoteSetupStepId, string> = {
    contact: [quote.customer.name, quote.customer.contactName, quote.customer.contactPhone, quote.customer.addressLines.join(", "), value.subAccountStatus === "yes" ? `Sub account: ${value.subAccount}` : "No sub account"].filter(Boolean).join(" · "),
    equipment: rows.length ? `${rows.length} items · ${rows.reduce((n, row) => n + row.quantity, 0)} units · ${new Intl.NumberFormat("en-US", { style: "currency", currency: quote.metadata.currencyCode || "USD" }).format(rows.reduce((n, row) => n + row.totalPrice, 0))}` : "No equipment needed",
    pricing: [quote.orderProcessing?.dataPlanDetails, value.corporatePricing === "yes" ? "Corporate pricing" : value.pricingStructure === "pool" ? "Pool pricing" : "Individual pricing"].filter(Boolean).join(" · "),
    delivery: [quote.orderProcessing?.shippingRequired === "yes" ? "Shipping required" : "No shipping", `Overages: ${quote.orderProcessing?.overageOptIn === "yes" ? "opted in" : quote.orderProcessing?.overageOptIn === "no" ? "opted out" : "not applicable"}`, `Public IP: ${value.publicIp}`, quote.orderProcessing?.notes].filter(Boolean).join(" · "),
    review: "",
  };
  return <section className="builder-panel rq-setup" aria-label="Required quote information">
    <div className="rq-setup-customer"><span><strong>{quote.customer.name}</strong><small>Quote setup</small></span><button type="button" className="rq-button rq-button-quiet" onClick={onEditCustomer}><Pencil size={14} />Change customer</button></div>
    <nav className="rq-setup-steps" aria-label="Quote setup steps">{steps.map((step, index) => <button key={step.id} type="button" aria-current={index === active ? "step" : undefined} onClick={() => go(index)}><span className="rq-setup-number">{index < 4 && !step.missing.length ? <Check size={15} aria-label="Complete" /> : index + 1}</span><span>{step.title}</span></button>)}</nav>
    <header className="rq-setup-heading"><span>Step {active + 1} of {steps.length}</span><h2 ref={heading} tabIndex={-1}>{current.title}</h2><p>{current.description}</p></header>
    {attempted && current.missing.length > 0 && <div className="rq-setup-error" role="alert"><strong>Complete these to continue:</strong><ul>{current.missing.map(item => <li key={item}>{item}</li>)}</ul></div>}
    <div ref={body} className="rq-setup-body" data-setup-step={current.id}>
    {current.id === "contact" && <div className="rq-detail-fields">
      <label className="builder-field"><span>Sub account applicable?</span><select value={value.subAccountStatus} onChange={e => update({ subAccountStatus: e.target.value as ProcessingRequirements["subAccountStatus"] })}><option value="pending">Choose an answer</option><option value="yes">Yes</option><option value="no">No / not applicable</option></select></label>
      {value.subAccountStatus === "yes" && <label className="builder-field"><span>Sub account name / ID</span><input required value={value.subAccount} onChange={e => update({ subAccount: e.target.value })} /></label>}
      <label className="builder-field"><span>Service address</span><textarea required rows={3} value={quote.customer.addressLines.join("\n")} onChange={e => onChange(draft => { draft.customer.addressLines = e.target.value.split("\n"); return draft; })} /></label>
      <label className="builder-field"><span>POC name</span><input required value={quote.customer.contactName} onChange={e => onChange(draft => { draft.customer.contactName = e.target.value; return draft; })} /></label>
      <label className="builder-field"><span>POC phone number</span><input required type="tel" value={quote.customer.contactPhone} onChange={e => onChange(draft => { draft.customer.contactPhone = e.target.value; return draft; })} /></label>
    </div>}
    {current.id === "equipment" && <>
    <div className="rq-order-section">
      {!rows.length && <label className="builder-field"><span>Equipment needed?</span><select value={value.equipmentRequired} onChange={e => update({ equipmentRequired: e.target.value as ProcessingRequirements["equipmentRequired"] })}><option value="pending">Choose an answer</option><option value="yes">Yes — add equipment in Line Items</option><option value="no">No equipment needed</option></select></label>}
      <button type="button" className="rq-button" onClick={onEditItems}>Add / edit equipment in Line Items</button>
      {rows.length > 0 && quote.metadata.workflowMode !== "major_project" && <p>Quick Quote equipment is sold as standalone items.</p>}
      {rows.map(row => <div key={row.id} className="rq-order-section"><strong>{row.itemName}</strong><p>Qty {row.quantity} · Unit price {new Intl.NumberFormat("en-US", { style: "currency", currency: quote.metadata.currencyCode || "USD" }).format(row.unitPrice)} · Total {new Intl.NumberFormat("en-US", { style: "currency", currency: quote.metadata.currencyCode || "USD" }).format(row.totalPrice)}</p><div className="rq-detail-fields">
        {quote.metadata.workflowMode === "major_project" && <label className="builder-field"><span>{row.itemName}: assembly?</span><select value={value.equipment[row.id]?.kind || "pending"} onChange={e => update({ equipment: { ...value.equipment, [row.id]: { assemblyDetails: value.equipment[row.id]?.assemblyDetails || "", kind: e.target.value as "pending" | "assembly" | "standalone" } } })}><option value="pending">Choose an answer</option><option value="assembly">Yes — assembly</option><option value="standalone">No — standalone item</option></select></label>}
        {quote.metadata.workflowMode === "major_project" && value.equipment[row.id]?.kind === "assembly" && <label className="builder-field"><span>Assembly details (optional)</span><input value={value.equipment[row.id].assemblyDetails} onChange={e => update({ equipment: { ...value.equipment, [row.id]: { ...value.equipment[row.id], assemblyDetails: e.target.value } } })} placeholder="Assembly number / included parts" /></label>}
      </div></div>)}
    </div>

    </>}
    {current.id === "pricing" && <><div className="rq-detail-fields">
      <label className="builder-field"><span>Data Plan/Pool</span><input required value={quote.orderProcessing?.dataPlanDetails || ""} placeholder="Plan / pool name and allowance, or Not applicable" onChange={e => onChange(draft => { draft.orderProcessing = { ...getOrderProcessing(draft), dataPlanDetails: e.target.value }; return draft; })} /></label>
      <label className="builder-field"><span>Corporate pricing?</span><select value={value.corporatePricing} onChange={e => update(e.target.value === "no" ? prefillStarlinkRates({ ...value, corporatePricing: "no" }) : { corporatePricing: e.target.value as ProcessingRequirements["corporatePricing"] })}><option value="pending">Choose an answer</option><option value="yes">Yes</option><option value="no">No — specify rates below</option></select></label>
      {value.corporatePricing === "yes" && <label className="builder-field"><span>Corporate pricing reference (optional)</span><input value={value.corporatePricingReference} onChange={e => update({ corporatePricingReference: e.target.value })} placeholder="Agreement / rate card" /></label>}
    </div>
    {value.corporatePricing === "no" && <details className="rq-setup-defaults"><summary>Starlink price defaults</summary><p>Editable defaults from the Starlink-only price sheet dated December 29, 2025. Review these rates for this order.</p><div className="rq-detail-fields"><label className="builder-field"><span>Starlink support default</span><select value={value.starlinkService} onChange={e => update({ starlinkService: e.target.value as ProcessingRequirements["starlinkService"], rates: { ...value.rates, managementSupport: { status: "priced", amount: e.target.value === "mini_vehicle" ? 5 : 10, basis: "per month" } } })}><option value="fixed">Fixed location — $10/month</option><option value="mini_vehicle">Mini vehicle — $5/month</option></select></label><button type="button" className="rq-button" onClick={() => update(prefillStarlinkRates(value, true))}>Reset to sheet prices</button></div></details>}
    {value.corporatePricing === "no" && <label className="builder-field"><span>Non-corporate pricing structure</span><select value={value.pricingStructure} onChange={e => update({ pricingStructure: e.target.value as ProcessingRequirements["pricingStructure"] })}><option value="pending">Choose individual or pool</option><option value="individual">Individual: TAC, 50GB, 500GB, overages and support</option><option value="pool">Pool: Pool TAC and management/support</option></select></label>}
    {value.corporatePricing === "no" && value.pricingStructure !== "pending" && <fieldset className="rq-order-section"><legend>Required non-corporate pricing</legend><p>Confirm the agreed rate and billing basis for each item. Use Line Items for charges included in the quote totals.</p>{requiredProcessingRates(value).map(({ key, label }) => <div key={key} className="rq-detail-fields">
      <label className="builder-field"><span>{label}</span><select value={value.rates[key].status} onChange={e => update({ rates: { ...value.rates, [key]: { ...value.rates[key], status: e.target.value } } })}><option value="pending">Choose an answer</option><option value="priced">Specify price</option><option value="included">Included</option><option value="not_applicable">Not applicable</option></select></label>
      {value.rates[key].status === "priced" && <><label className="builder-field"><span>{label} price ({quote.metadata.currencyCode})</span><input type="number" min="0" step="0.01" required value={value.rates[key].amount ?? ""} onChange={e => update({ rates: { ...value.rates, [key]: { ...value.rates[key], amount: e.target.value === "" ? null : Number(e.target.value) } } })} /></label><label className="builder-field"><span>{label} billing basis</span><input required value={value.rates[key].basis} onChange={e => update({ rates: { ...value.rates, [key]: { ...value.rates[key], basis: e.target.value } } })} /></label></>}
    </div>)}</fieldset>}
    </>}
    {current.id === "delivery" && <div className="rq-detail-fields">
      <label className="builder-field"><span>Opt in or out of overages</span><select value={quote.orderProcessing?.overageOptIn || "pending"} onChange={e => updateOrder({ overageOptIn: e.target.value as NonNullable<QuoteRecord["orderProcessing"]>["overageOptIn"] })}><option value="pending">Choose an answer</option><option value="yes">Opt in</option><option value="no">Opt out</option><option value="not_applicable">Not applicable</option></select></label>
      <label className="builder-field"><span>Public IP?</span><select value={value.publicIp} onChange={e => update({ publicIp: e.target.value as ProcessingRequirements["publicIp"] })}><option value="pending">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      <label className="builder-field"><span>Shipping required?</span><select value={quote.orderProcessing?.shippingRequired || "pending"} onChange={e => updateOrder({ shippingRequired: e.target.value as NonNullable<QuoteRecord["orderProcessing"]>["shippingRequired"] })}><option value="pending">Choose an answer</option><option value="yes">Yes</option><option value="no">No shipping needed</option></select></label>
      {quote.orderProcessing?.shippingRequired === "yes" && <>
        <label className="builder-field"><span>Shipping address</span><textarea required rows={3} value={(quote.shippingSameAsBillTo ? quote.billTo.lines : quote.shipTo.lines).join("\n")} onChange={e => onChange(draft => { const shipping = draft.shippingSameAsBillTo ? draft.billTo : draft.shipTo; shipping.lines = e.target.value.split("\n"); return draft; })} /></label>
        <label className="builder-field"><span>Shipping contact name</span><input required value={(quote.shippingSameAsBillTo ? quote.billTo.attention : quote.shipTo.attention) || ""} onChange={e => onChange(draft => { const shipping = draft.shippingSameAsBillTo ? draft.billTo : draft.shipTo; shipping.attention = e.target.value; return draft; })} /></label>
        <label className="builder-field"><span>Shipping contact phone</span><input required type="tel" value={quote.orderProcessing.shippingContactPhone} onChange={e => updateOrder({ shippingContactPhone: e.target.value })} /></label>
      </>}

      <label className="builder-field"><span>Special instructions</span><textarea required rows={3} value={quote.orderProcessing?.notes || ""} placeholder="Instructions for fulfillment, or None" onChange={e => updateOrder({ notes: e.target.value })} /></label>
      {!quote.orderProcessing?.notes && <button className="rq-button rq-button-quiet" type="button" onClick={() => updateOrder({ notes: "None" })}>No special instructions</button>}
    </div>}
    {current.id === "review" && <><p className="rq-setup-review-intro">{current.missing.length ? "Finish the highlighted steps, then create your quote." : "Your order details are complete. Create the quote to open its preview."}</p><div className="rq-setup-review">{steps.slice(0, 4).map((step, index) => <article key={step.id} data-incomplete={Boolean(step.missing.length)}><div><strong>{step.title}</strong><p>{step.missing.length ? step.missing.join("; ") : summaries[step.id]}</p></div><button type="button" className="rq-button rq-button-quiet" aria-label={`Edit ${step.title}`} onClick={() => go(index)}>{step.missing.length ? "Finish" : "Edit"}<ArrowRight size={15} /></button></article>)}</div>{blockedMessage && <p role="alert" className="rq-setup-error">{blockedMessage}</p>}</>}
    </div>
    <footer className="rq-setup-footer"><button type="button" className="rq-button" disabled={active === 0} onClick={() => go(active - 1)}><ArrowLeft size={16} />Back</button><div><small>{active < 4 ? `Next: ${steps[active + 1].title}` : "Next: Quote preview"}</small><button type="button" className="rq-button rq-button-primary rq-setup-next" onClick={next}>{active < 4 ? `Continue to ${steps[active + 1].title}` : current.missing.length ? "Finish missing details" : blockedMessage ? "Fix line items" : "Create quote"}<ArrowRight size={16} /></button></div></footer>
  </section>;
}

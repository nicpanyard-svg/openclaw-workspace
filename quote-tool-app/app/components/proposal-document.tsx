"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, type ReactNode } from "react";
import { IliosEstimateDocument } from "@/app/components/ilios-estimate-document";
import { ProposalAttachmentPreview } from "@/app/components/proposal-attachment-preview";
import { buildExecutiveSummaryRenderBlocks } from "@/app/lib/executive-summary";
import { getCombinedOneTimeTotal, getEquipmentTotal, getIncludedEquipmentRows, getIncludedSectionARows, getIncludedServiceRows, getLeasePricingSummary, getOptionalServicesTotal, getProposalOptionCostSummary, getQuotedSalesTax, getRecurringMonthlyTotal } from "@/app/lib/proposal-commercial-summary";
import { customerCopy, getCustomerQuoteContent } from "@/app/lib/proposal-customer-content";
import { getProposalAttachments } from "@/app/lib/proposal-attachments";
import { getAnnualSubscriptionSummary } from "@/app/lib/quote-line-billing";
import { getQuoteBranding, resolveQuoteOutputTemplateKey } from "@/app/lib/quote-branding";
import type { QuoteRecord } from "@/app/lib/quote-record";
import "./proposal-customer.css";

type ProposalDocumentProps = {
  quote: QuoteRecord;
  assetOverrides?: { inetLogoSrc?: string };
};

function money(value: number, currency: string, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits }).format(value);
}

function Lines({ values }: { values: Array<string | undefined> }) {
  return <>{values.filter((value) => value?.trim()).map((value, index) => <div key={index}>{value}</div>)}</>;
}

function ItemCopy({ title, description, image }: { title: string; description?: string; image?: string }) {
  const note = customerCopy(description);
  return <div className="cp-item">
    {image && <img className="cp-item-image" src={image} alt={title} />}
    <div><strong>{title}</strong>{note && <p>{note}</p>}</div>
  </div>;
}

function Section({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={"cp-section " + className}><h2>{title}</h2>{children}</section>;
}

function DetailedProposalDocument({ quote, assetOverrides }: ProposalDocumentProps) {
  const branding = getQuoteBranding(quote);
  const currency = quote.metadata.currencyCode || "USD";
  const content = getCustomerQuoteContent(quote);
  const services = getIncludedSectionARows(quote);
  const equipment = getIncludedEquipmentRows(quote);
  const fieldServices = getIncludedServiceRows(quote);
  const recurring = getRecurringMonthlyTotal(quote);
  const equipmentTotal = getEquipmentTotal(quote);
  const fieldTotal = getOptionalServicesTotal(quote);
  const upfront = getCombinedOneTimeTotal(quote);
  const annual = getAnnualSubscriptionSummary(quote);
  const lease = getLeasePricingSummary(quote);
  const isLease = quote.metadata.quoteType === "lease";
  const monthly = isLease ? lease.leaseMonthly : recurring;
  const monthlyConfirmed = !isLease || lease.hasActiveDataAgreement;
  const options = getProposalOptionCostSummary(quote);
  const attachments = useMemo(() => getProposalAttachments(quote), [quote]);
  const executiveBlocks = quote.executiveSummary.enabled ? buildExecutiveSummaryRenderBlocks(quote.executiveSummary) : [];
  const customerFields = (quote.customFields ?? []).filter((field) => field.visibility === "customer" && field.label.trim() && field.value.trim());
  const overageRows = services.filter((row) => row.rowType === "overage");
  const overage = quote.orderProcessing?.overageOptIn ?? "pending";
  const overageLabel = { pending: "Not confirmed", yes: "Opted in", no: "Opted out", not_applicable: "Not applicable" }[overage];
  const tax = getQuotedSalesTax(quote);
  const addressValues = (address: QuoteRecord["billTo"]) => [address.companyName, address.attention, ...address.lines].filter((value): value is string => Boolean(value?.trim()));
  const billTo = addressValues(quote.billTo);
  const shipTo = addressValues(quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo);
  const sameAddress = (left: string[], right: string[]) => left.join(" ").replace(/\s+/g, " ").trim().toLowerCase() === right.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
  const customerAddress = [quote.customer.name, quote.customer.contactName, ...quote.customer.addressLines].filter(Boolean);
  const showBillTo = billTo.length > 0 && !sameAddress(billTo, customerAddress);
  const showShipTo = shipTo.length > 0 && !sameAddress(shipTo, customerAddress);
  const sameBillingShipping = sameAddress(billTo, shipTo);
  const date = quote.metadata.proposalDate;
  const extraDetails = [
    { label: "Subscription commitment", value: services.length ? content.serviceTermMonths + " months" : "" },
    { label: "Equipment lease", value: isLease ? lease.termMonths + " months" : "" },
    { label: "Billing begins", value: content.settings.billingStart },
    { label: "Delivery / lead time", value: content.settings.deliveryLeadTime },
  ].filter((detail) => detail.value);

  return <main className="proposal-shell customer-proposal" data-attachments-ready="true" style={{ ["--cp-brand" as string]: branding.primaryColor }}>
    <header className="cp-header">
      <img className="cp-logo" src={assetOverrides?.inetLogoSrc ?? branding.logoSrc} alt={branding.logoAlt} />
      <div className="cp-reference"><strong>{quote.metadata.proposalNumber}</strong><span>{date + " / Revision " + quote.metadata.revisionVersion}</span>{quote.metadata.expirationDate && <span>Valid through {quote.metadata.expirationDate}</span>}<span className={content.isDraft ? "cp-draft" : "cp-issued"}>{content.isDraft ? "Draft proposal" : "Commercial proposal"}</span></div>
    </header>

    <div className="cp-title"><p>Prepared for {quote.customer.name}</p><h1>{content.title}</h1>{content.subtitle && <p>{content.subtitle}</p>}</div>

    <div className="cp-commercial">
      <div><span>Total monthly payment</span><strong>{monthlyConfirmed ? money(monthly, currency) : "Pending agreement"}</strong><small>{isLease ? lease.termMonths + "-month equipment lease" : services.length ? "Recurring services" : annual.items.length ? "No monthly charges quoted" : "No recurring charges quoted"}</small></div>
      <div><span>One-time charges</span><strong>{money(upfront, currency)}</strong><small>{tax > 0 ? "Includes quoted sales tax" : "Quoted equipment and services"}</small></div>
      {annual.items.length > 0 && <>
        <div><span>Year 1 prepaid annual subscriptions</span><strong>{money(annual.firstYearTotal, currency)}</strong><small>Billed annually, separate from one-time charges</small></div>
        <div><span>Annual renewals from Year 2</span><strong>{money(annual.renewalTotal, currency)} / yr</strong><small>Included subscriptions only; excludes options</small></div>
      </>}
    </div>
    {annual.items.length > 0 && <div className="cp-annual-summary">
      <p><strong>One-time + Year 1 annual charges: {money(upfront + annual.firstYearTotal, currency)}.</strong> Monthly payments and options are separate.</p>
      {monthlyConfirmed && <p>Year 1 recurring monthly equivalent: {money(monthly + annual.monthlyEquivalent, currency)}. Annual subscriptions are billed annually, not monthly.</p>}
    </div>}
    {isLease && monthlyConfirmed && <p className="cp-payment-breakdown">Equipment lease {money(lease.hardwareMonthly, currency)}/month + recurring services {money(recurring, currency)}/month.</p>}

    <div className="cp-parties">
      <div><h3>Customer</h3><strong>{quote.customer.name}</strong><Lines values={[quote.customer.contactName, quote.customer.contactEmail, quote.customer.contactPhone]} /></div>
      <div><h3>Service location</h3>{quote.customer.addressLines.some((line) => line.trim()) ? <Lines values={quote.customer.addressLines} /> : <span>To be confirmed</span>}</div>
      <div><h3>Prepared by</h3><strong>{quote.inet.contactName}</strong><Lines values={[quote.inet.name, quote.inet.contactEmail, quote.inet.contactPhone]} /></div>
    </div>
    {(showBillTo || showShipTo) && <div className="cp-addresses">
      {showBillTo && <div><h3>{sameBillingShipping ? "Billing & shipping" : "Billing address"}</h3><Lines values={billTo} /></div>}
      {showShipTo && !sameBillingShipping && <div><h3>Shipping address</h3><Lines values={shipTo} /></div>}
    </div>}
    {extraDetails.length > 0 && <dl className="cp-facts">{extraDetails.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
    {content.scope && !executiveBlocks.length && <Section title="Proposed scope"><p>{content.scope}</p></Section>}
    {executiveBlocks.length > 0 && <Section title={customerCopy(quote.executiveSummary.heading) || "Proposed scope"}>{executiveBlocks.map((block) => {
      if (block.type === "heading") return <h3 key={block.id}>{block.text}</h3>;
      if (block.type === "paragraph") return <p className="cp-preserve-lines" key={block.id}>{block.text}</p>;
      const Tag = block.type === "numbered_list" ? "ol" : "ul";
      return <Tag key={block.id}>{(block.items ?? []).map((item, index) => <li key={index}>{item}</li>)}</Tag>;
    })}</Section>}
    {customerFields.length > 0 && <Section title="Scope details"><dl className="cp-custom-details">{customerFields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></Section>}

    {services.length > 0 && <Section title="Subscriptions & service pricing">
      {content.serviceIntro && <p className="cp-preserve-lines">{content.serviceIntro}</p>}
      {content.serviceNotes.map((line, index) => <p className="cp-preserve-lines" key={index}>{line}</p>)}
      {quote.orderProcessing?.dataPlanDetails && <p><strong>Data allocation:</strong> {quote.orderProcessing.dataPlanDetails}</p>}
      <table className="cp-table"><caption>Included subscriptions and fees</caption><colgroup><col className="cp-col-item" /><col className="cp-col-qty" /><col className="cp-col-price" /><col className="cp-col-price" /></colgroup><thead><tr><th>Service / fee</th><th>Qty</th><th>Unit rate</th><th>Monthly total</th></tr></thead><tbody>
        {services.map((row) => <tr key={row.id}><td><ItemCopy title={row.description} />{row.includedText?.map(customerCopy).filter(Boolean).map((line, index) => <p className="cp-row-note" key={index}>{line}</p>)}{row.rowType === "overage" && <span className="cp-row-note">Usage-based charge{row.unitLabel ? " per " + row.unitLabel : ""}</span>}</td><td>{row.quantity ?? "-"}</td><td>{money(row.monthlyRate ?? row.unitPrice ?? 0, currency)}{row.rowType === "overage" && row.unitLabel ? " / " + row.unitLabel : ""}</td><td>{row.rowType === "overage" ? "Usage-based" : money(row.totalMonthlyRate ?? 0, currency)}</td></tr>)}
      </tbody><tfoot><tr><td colSpan={3}>Recurring services per month</td><td>{money(recurring, currency)}</td></tr></tfoot></table>
      <div className="cp-service-notes">
        {quote.orderProcessing?.monitoringSupportDetails && <p><strong>Monitoring &amp; support:</strong> {quote.orderProcessing.monitoringSupportDetails}</p>}
        {quote.orderProcessing?.terminalAccessFeeDetails && <p><strong>TAF:</strong> {quote.orderProcessing.terminalAccessFeeDetails}</p>}
        {(overageRows.length > 0 || overage !== "pending") && <p><strong>Overage election:</strong> {overageLabel}. Usage-based charges are separate from the fixed monthly payment.</p>}
      </div>
    </Section>}

    {equipment.length > 0 && <Section title={isLease ? "Equipment included in lease" : "Equipment & materials"}>
      {content.equipmentIntro && <p className="cp-preserve-lines">{content.equipmentIntro}</p>}
      <table className={"cp-table " + (isLease ? "cp-equipment-lease" : "")}><caption>Included equipment</caption><colgroup><col className="cp-col-item" /><col className="cp-col-qty" />{!isLease && <col className="cp-col-price" />}<col className="cp-col-price" /></colgroup><thead><tr><th>Equipment / item</th><th>Qty</th>{!isLease && <th>Unit price</th>}<th>{isLease ? "Billing" : "Line total"}</th></tr></thead><tbody>
        {equipment.map((row) => <tr key={row.id}><td><ItemCopy title={row.itemName} description={row.description} image={row.imageUrl} />{row.partNumber && <span className="cp-row-note">Part {row.partNumber}</span>}</td><td>{row.quantity}</td>{!isLease && <td>{money(row.unitPrice, currency)}</td>}<td>{isLease ? "Included in lease" : money(row.totalPrice, currency)}</td></tr>)}
      </tbody>{!isLease && <tfoot><tr><td colSpan={3}>One-time equipment total</td><td>{money(equipmentTotal, currency)}</td></tr></tfoot>}</table>
      {isLease && <p className="cp-muted">No separate upfront equipment purchase is charged.</p>}
    </Section>}

    {fieldServices.length > 0 && <Section title="Implementation & field services">
      {content.fieldServiceIntro && <p className="cp-preserve-lines">{content.fieldServiceIntro}</p>}
      <table className="cp-table"><caption>Included implementation and field services</caption><colgroup><col className="cp-col-item" /><col className="cp-col-qty" /><col className="cp-col-price" /><col className="cp-col-price" /></colgroup><thead><tr><th>Service</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>
        {fieldServices.map((row) => <tr key={row.id}><td><ItemCopy title={row.description} description={row.notes} />{row.pricingStage === "budgetary" && !content.fieldServicePricingConfirmed && <span className="cp-row-note">Estimated</span>}</td><td>{row.quantity}{row.unitLabel ? " " + row.unitLabel : ""}</td><td>{money(row.unitPrice, currency)}</td><td>{money(row.totalPrice, currency)}</td></tr>)}
      </tbody><tfoot><tr><td colSpan={3}>One-time services total</td><td>{money(fieldTotal, currency)}</td></tr></tfoot></table>
    </Section>}
    {tax > 0 && <p className="cp-tax"><strong>Quoted sales tax:</strong> {money(tax, currency)} (included in one-time charges).</p>}

    {annual.items.length > 0 && <Section title="Annual subscriptions & renewals" className="cp-annual-subscriptions">
      <table className="cp-table cp-annual-table"><caption>Included annual subscriptions and renewal costs</caption><colgroup><col style={{ width: "42%" }} /><col style={{ width: "8%" }} /><col style={{ width: "16%" }} /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /></colgroup><thead><tr><th>Subscription</th><th>Qty</th><th>Annual unit rate</th><th>Year 1 charge</th><th>Annual renewal</th></tr></thead><tbody>
        {annual.items.map((item) => <tr key={item.key}><td><ItemCopy title={item.label} description={item.description} /><span className="cp-row-note">{item.startsYear === 2 ? "First year included; paid renewals from Year 2" : "Year 1 prepaid annual subscription"}. Rate per {item.unitLabel}.</span></td><td>{item.quantity ?? "-"}</td><td>{item.unitPrice == null ? "-" : money(item.unitPrice, currency, 4)} / yr</td><td>{money(item.firstYearAmount, currency)}</td><td>{money(item.annualAmount, currency)} / yr</td></tr>)}
      </tbody><tfoot><tr><td colSpan={3}>Included annual subscriptions</td><td>{money(annual.firstYearTotal, currency)}</td><td>{money(annual.renewalTotal, currency)} / yr</td></tr></tfoot></table>
      <p className="cp-muted">Renewal amounts are based on the quoted annual rates. Optional renewals are listed separately under Option Costs.</p>
    </Section>}

    {options.items.length > 0 && <Section title="Option Costs" className="cp-options">
      <p className="cp-muted">Available options only. Excluded from the included scope and all base totals.</p>
      <table className="cp-table cp-option-table"><caption>Available options excluded from base pricing</caption><colgroup><col className="cp-col-ref" /><col className="cp-col-option" /><col className="cp-col-qty" /><col className="cp-col-price" /><col className="cp-col-price" /></colgroup><thead><tr><th>Ref</th><th>Available option</th><th>Qty</th><th>Unit price</th><th>Option total</th></tr></thead><tbody>
        {options.items.map((item, index) => <tr key={item.key}><td>{"O" + (index + 1)}</td><td><ItemCopy title={item.label} description={item.description} /><span className="cp-row-note">{item.usageBased ? "Usage-based" : item.cadence === "monthly" ? "Monthly" : item.cadence === "annual" ? (item.startsYear === 2 ? "Annual renewal from Year 2; first year included" : "Annual subscription") + ". Rate per " + (item.unitLabel || "subscription") + "." : "One-time"}</span></td><td>{item.usageBased ? "-" : item.quantity ?? "-"}</td><td>{item.unitPrice == null ? "-" : money(item.unitPrice, currency, 4)}{item.usageBased ? " / " + (item.unitLabel || "unit") : item.cadence === "monthly" && item.unitPrice != null ? " / mo" : item.cadence === "annual" ? " / yr" : ""}</td><td>{item.usageBased ? "Usage-based" : money(item.amount, currency)}{!item.usageBased && item.cadence === "monthly" ? " / mo" : item.cadence === "annual" ? " / yr" : ""}</td></tr>)}
      </tbody><tfoot><tr><td colSpan={4}>Available monthly options</td><td>{money(options.monthlyTotal, currency)} / mo</td></tr><tr><td colSpan={4}>Available one-time options</td><td>{money(options.oneTimeTotal, currency)}</td></tr>{options.items.some((item) => item.cadence === "annual") && <tr><td colSpan={4}>Available annual subscription / renewal options</td><td>{money(options.annualTotal, currency)} / yr</td></tr>}</tfoot></table>
    </Section>}

    <Section title="Commercial terms" className="cp-terms">
      <dl className="cp-facts">
        <div><dt>Currency</dt><dd>{currency}</dd></div>
        {quote.metadata.expirationDate && <div><dt>Quote valid through</dt><dd>{quote.metadata.expirationDate}</dd></div>}
        {services.length > 0 && <div><dt>Subscription commitment</dt><dd>{content.serviceTermMonths} months</dd></div>}
        {isLease && <div><dt>Equipment lease term</dt><dd>{lease.termMonths} months</dd></div>}
      </dl>
      {isLease && <div className="cp-lease-terms">
        <p><strong>Equipment at end of lease:</strong> {content.settings.leaseEndTerms || "To be confirmed."}</p>
        <p><strong>Pricing after the equipment lease:</strong> {content.settings.postLeaseTerms || "To be confirmed."}</p>
      </div>}
      {content.pricingTerms.map((line, index) => <p key={index}>{line}</p>)}
      {content.serviceTerms.length > 0 && <div className="cp-terms-subsection"><h3>{content.serviceTermsTitle}</h3>{content.serviceTerms.map((line, index) => <p key={index}>{line}</p>)}</div>}
      {content.warranty.length > 0 && <div className="cp-terms-subsection"><h3>Warranty</h3>{content.warranty.map((line, index) => <p key={index}>{line}</p>)}</div>}
    </Section>

    <section className="cp-acceptance">
      <h2>{content.approvalReady ? "Quote acceptance" : "Commercial details to confirm"}</h2>
      <div className="cp-accepted-totals"><div><span>Included monthly payment</span><strong>{monthlyConfirmed ? money(monthly, currency) : "Pending agreement"}</strong></div><div><span>Included one-time charges</span><strong>{money(upfront, currency)}</strong></div></div>
      {annual.items.length > 0 && <><div className="cp-accepted-totals"><div><span>Included Year 1 annual subscriptions</span><strong>{money(annual.firstYearTotal, currency)}</strong></div><div><span>Included annual renewals from Year 2</span><strong>{money(annual.renewalTotal, currency)} / yr</strong></div></div><p><strong>One-time + Year 1 annual charges: {money(upfront + annual.firstYearTotal, currency)}.</strong> Monthly payments are separate.</p></>}
      {options.items.length > 0 && <p>All items under Option Costs are excluded from these totals and from this acceptance. A revised quote is required to include chosen options.</p>}
      {content.approvalReady ? <>
        <p>Acceptance applies to the included scope, pricing, and applicable terms in this proposal.</p>
        {content.approvalNote && <p className="cp-preserve-lines">{content.approvalNote}</p>}
        <div className="cp-signatures"><div><span>Authorized signature</span></div><div><span>Printed name / title</span></div><div><span>Date</span></div></div>
      </> : <><p>This proposal is pending the following commercial details and is not ready for order authorization.</p><ul>{content.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></>}
    </section>

    {attachments.length > 0 && <Section title="Technical appendix" className="cp-appendix-index">
      <table className="cp-table cp-appendix-table"><caption>Technical appendix index</caption><thead><tr><th>Ref</th><th>Quoted item / scope</th><th>Document</th></tr></thead><tbody>{attachments.map((entry) => <tr key={entry.id}><td>{entry.id}</td><td>{entry.itemLabels.join("; ")}</td><td>{entry.label}<span className="cp-row-note">{entry.kind === "drawing" ? "System drawing" : "Supporting document"}</span></td></tr>)}</tbody></table>
      <p className="cp-muted">Supporting documentation follows this index in reference order. Included scope and pricing are defined by the commercial schedules above.</p>
      {attachments.map((entry) => <ProposalAttachmentPreview key={entry.attachment.storageKey} entry={entry} />)}
    </Section>}
    <footer className="cp-screen-footer no-print">{branding.legalName} / {quote.metadata.proposalNumber}</footer>
  </main>;
}

export function ProposalDocument(props: ProposalDocumentProps) {
  if (resolveQuoteOutputTemplateKey(props.quote) === "estimate_compact") return <IliosEstimateDocument quote={props.quote} />;
  return <DetailedProposalDocument {...props} />;
}

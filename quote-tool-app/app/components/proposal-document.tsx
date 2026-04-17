import Image from "next/image";
import type {
  PerKitPricingRow,
  PoolPricingRow,
  QuoteRecord,
  ServicePricingRow,
} from "@/app/lib/quote-record";

type ProposalDocumentProps = {
  quote: QuoteRecord;
};

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getSectionARows(sectionA: QuoteRecord["sections"]["sectionA"]) {
  return sectionA.mode === "pool" ? sectionA.poolRows : sectionA.perKitRows;
}

function getSectionATotal(rows: Array<PoolPricingRow | PerKitPricingRow>) {
  return Number(
    rows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2),
  );
}

function getSectionBTotal(quote: QuoteRecord) {
  return Number(
    quote.sections.sectionB.lineItems
      .reduce((sum, row) => sum + row.totalPrice, 0)
      .toFixed(2),
  );
}

function getSectionCTotal(quote: QuoteRecord) {
  return Number(
    quote.sections.sectionC.lineItems
      .reduce((sum, row) => sum + row.totalPrice, 0)
      .toFixed(2),
  );
}

function getLeaseMonthly(quote: QuoteRecord, recurringMonthlyTotal: number, equipmentTotal: number) {
  if (quote.metadata.quoteType !== "lease") return 0;
  const term = Math.max(quote.sections.sectionA.termMonths || 1, 1);
  return Number((recurringMonthlyTotal + equipmentTotal / term).toFixed(2));
}

function getPricingLabel(row: ServicePricingRow) {
  if (row.pricingStage === "final") return "Final pricing";
  return "Budgetary pricing";
}

export function ProposalDocument({ quote }: ProposalDocumentProps) {
  const currencyCode = quote.metadata.currencyCode || "USD";
  const sectionARows = getSectionARows(quote.sections.sectionA);
  const recurringMonthlyTotal = getSectionATotal(sectionARows);
  const equipmentTotal = getSectionBTotal(quote);
  const sectionCTotal = getSectionCTotal(quote);
  const leaseMonthly = getLeaseMonthly(quote, recurringMonthlyTotal, equipmentTotal);
  const enabledSections = [
    quote.sections.sectionA.enabled ? `Section A — ${quote.sections.sectionA.title}` : null,
    quote.sections.sectionB.enabled ? `Section B — ${quote.sections.sectionB.title}` : null,
    quote.sections.sectionC.enabled ? `Section C — ${quote.sections.sectionC.title}` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="proposal-shell">
      <section className="proposal-page cover-page">
        <div className="cover-watermark" />
        <div className="proposal-confidential-mark">CONFIDENTIAL</div>
        <div className="proposal-corner-watermark" />
        <div className="cover-grid">
          <div className="cover-topbar">
            <div className="cover-brand-lockup">
              <Image
                src="/inet-logo.png"
                alt="iNet logo"
                width={220}
                height={70}
                className="cover-brand-logo"
                priority
              />
              <div className="cover-brand-subtitle">Infrastructure Networks, Inc.</div>
            </div>
            <div className="cover-proposal-meta">
              <div className="cover-meta-label">Proposal</div>
              <div className="cover-meta-value">#{quote.metadata.proposalNumber}</div>
              <div>{quote.metadata.proposalDate}</div>
              <div className="cover-meta-chip">{quote.metadata.quoteType === "lease" ? "Lease" : "Purchase"}</div>
            </div>
          </div>

          <div className="cover-content">
            <div className="cover-kicker">Managed Services Proposal</div>
            <h1>{quote.metadata.documentTitle}</h1>
            <h2>{quote.metadata.documentSubtitle}</h2>

            <div className="cover-customer-grid">
              <div className="cover-customer-card">
                <div className="cover-customer-label">Prepared for</div>
                <div className="cover-customer-brand-row">
                  {quote.customer.logoDataUrl ? (
                    <img src={quote.customer.logoDataUrl} alt={`${quote.customer.name} logo`} className="customer-brand-logo" />
                  ) : (
                    <div className="customer-brand-fallback">{quote.customer.logoText || quote.customer.name}</div>
                  )}
                </div>
                <div className="cover-customer-name">{quote.customer.name}</div>
                <div className="cover-customer-lines">
                  {quote.customer.addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              </div>

              <div className="cover-contact-card">
                <div className="cover-customer-label">Prepared by</div>
                <div className="cover-contact-name">{quote.inet.contactName}</div>
                <div className="cover-contact-lines">
                  <div>{quote.inet.name}</div>
                  <div>{quote.inet.contactPhone}</div>
                  <div>{quote.inet.contactEmail}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="cover-summary-strip">
            <div className="cover-summary-card">
              <div className="cover-summary-label">Monthly recurring</div>
              <div className="cover-summary-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div>
            </div>
            <div className="cover-summary-card">
              <div className="cover-summary-label">One-time equipment</div>
              <div className="cover-summary-value">{formatCurrency(equipmentTotal, currencyCode)}</div>
            </div>
            <div className="cover-summary-card">
              <div className="cover-summary-label">Sections included</div>
              <div className="cover-summary-value cover-summary-value-small">{enabledSections.length}</div>
            </div>
          </div>
        </div>
        <div className="cover-band">
          <div className="cover-band-copy">Confidential commercial proposal prepared for review and approval.</div>
        </div>
      </section>

      <section className="proposal-page">
        <div className="proposal-confidential-mark">CONFIDENTIAL</div>
        <div className="proposal-corner-watermark" />
        <div className="proposal-header">
          <span>Confidential</span>
          <span>Proposal #{quote.metadata.proposalNumber}</span>
        </div>

        <div className="proposal-title-block">
          <div>
            <div className="proposal-overline">Executive Summary</div>
            <h2 className="proposal-section-title">Recommended commercial structure</h2>
          </div>
          <div className="proposal-date-card">
            <div className="proposal-date-label">Prepared</div>
            <div>{quote.metadata.proposalDate}</div>
          </div>
        </div>

        <div className="section-title-rule" />

        <div className="proposal-summary-grid">
          <div className="proposal-summary-panel">
            <div className="summary-panel-label">Customer</div>
            <div className="summary-panel-value">{quote.customer.name}</div>
            <div className="summary-panel-copy">{quote.customer.contactName}</div>
          </div>
          <div className="proposal-summary-panel">
            <div className="summary-panel-label">Commercial model</div>
            <div className="summary-panel-value">
              {quote.metadata.quoteType === "lease" ? "Lease structure" : "Purchase structure"}
            </div>
            <div className="summary-panel-copy">
              {quote.metadata.quoteType === "lease"
                ? `Estimated blended monthly total over ${quote.sections.sectionA.termMonths} months`
                : "Recurring services and one-time hardware shown separately"}
            </div>
          </div>
          <div className="proposal-summary-panel">
            <div className="summary-panel-label">Prepared by</div>
            <div className="summary-panel-value">{quote.inet.contactName}</div>
            <div className="summary-panel-copy">{quote.inet.name}</div>
          </div>
        </div>

        {quote.executiveSummary.enabled && (
          <div className="proposal-copy proposal-copy-card">
            {quote.executiveSummary.paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        )}

        <div className="proposal-callout-grid">
          <div className="proposal-callout">
            <div className="proposal-callout-label">Included sections</div>
            <ul className="proposal-bullets compact">
              {enabledSections.map((section) => (
                <li key={section}>{section}</li>
              ))}
            </ul>
          </div>
          <div className="proposal-callout totals-callout">
            <div className="proposal-callout-label">Commercial snapshot</div>
            <div className="totals-stack">
              <div><span>Recurring monthly</span><strong>{formatCurrency(recurringMonthlyTotal, currencyCode)}</strong></div>
              <div><span>One-time equipment</span><strong>{formatCurrency(equipmentTotal, currencyCode)}</strong></div>
              {quote.sections.sectionC.enabled && (
                <div><span>Optional services</span><strong>{formatCurrency(sectionCTotal, currencyCode)}</strong></div>
              )}
              {quote.metadata.quoteType === "lease" && (
                <div className="accent-row"><span>Estimated lease monthly</span><strong>{formatCurrency(leaseMonthly, currencyCode)}</strong></div>
              )}
            </div>
          </div>
        </div>
      </section>

      {quote.sections.sectionA.enabled && (
        <section className="proposal-page">
          <div className="proposal-confidential-mark">CONFIDENTIAL</div>
          <div className="proposal-corner-watermark" />
          <div className="proposal-header">
            <span>Confidential</span>
            <span>Proposal #{quote.metadata.proposalNumber}</span>
          </div>

          <div className="proposal-section-heading keep-with-next">
            <div className="section-heading-badge">Section A</div>
            <div className="proposal-overline">Recurring services</div>
            <h2 className="proposal-section-title">{quote.sections.sectionA.title}</h2>
            <p className="proposal-intro">
              {quote.sections.sectionA.introText ||
                `The pricing below reflects a ${quote.sections.sectionA.termMonths}-month commercial term.`}
            </p>
          </div>

          <table className="proposal-table sample-table">
            <thead>
              <tr>
                <th>Service Description</th>
                <th>Qty</th>
                <th>Unit Monthly</th>
                <th>Total Monthly</th>
              </tr>
            </thead>
            <tbody>
              {sectionARows.map((row) => (
                <tr key={row.id} className="keep-together">
                  <td>
                    <div className="proposal-cell-title">{row.description}</div>
                    {row.unitLabel && row.rowType !== "support" && (
                      <div className="proposal-cell-subtitle">Unit: {row.unitLabel}</div>
                    )}
                    {row.rowType === "support" && row.includedText && (
                      <ul className="proposal-bullets inline-bullets">
                        {row.includedText.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>{row.quantity ?? (row.rowType === "support" ? "Included" : "—")}</td>
                  <td>
                    {row.rowType === "support"
                      ? "Included"
                      : formatCurrency(row.monthlyRate ?? row.unitPrice ?? 0, currencyCode)}
                  </td>
                  <td>
                    {row.rowType === "support"
                      ? "Included"
                      : formatCurrency(row.totalMonthlyRate ?? 0, currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proposal-total-row">
                <td colSpan={3}>Section A total monthly recurring</td>
                <td>{formatCurrency(recurringMonthlyTotal, currencyCode)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {quote.sections.sectionB.enabled && (
        <section className="proposal-page">
          <div className="proposal-confidential-mark">CONFIDENTIAL</div>
          <div className="proposal-corner-watermark" />
          <div className="proposal-header">
            <span>Confidential</span>
            <span>Proposal #{quote.metadata.proposalNumber}</span>
          </div>

          <div className="proposal-section-heading keep-with-next">
            <div className="section-heading-badge">Section B</div>
            <div className="proposal-overline">Equipment and accessories</div>
            <h2 className="proposal-section-title">{quote.sections.sectionB.title}</h2>
            <p className="proposal-intro">
              {quote.sections.sectionB.introText ||
                "The prices below reflect one-time hardware and accessory charges."}
            </p>
          </div>

          <table className="proposal-table sample-table">
            <thead>
              <tr>
                <th>Equipment Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {quote.sections.sectionB.lineItems.map((row) => (
                <tr key={row.id} className="keep-together">
                  <td>
                    <div className="proposal-cell-title">{row.itemName}</div>
                    <div className="proposal-cell-subtitle">
                      {[row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).join(" • ") || "Hardware line item"}
                    </div>
                    {row.description && <div className="proposal-cell-note">{row.description}</div>}
                  </td>
                  <td>{row.quantity}</td>
                  <td>{formatCurrency(row.unitPrice, currencyCode)}</td>
                  <td>{formatCurrency(row.totalPrice, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proposal-total-row">
                <td colSpan={3}>Section B one-time equipment total</td>
                <td>{formatCurrency(equipmentTotal, currencyCode)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {quote.sections.sectionC.enabled && (
        <section className="proposal-page">
          <div className="proposal-confidential-mark">CONFIDENTIAL</div>
          <div className="proposal-corner-watermark" />
          <div className="proposal-header">
            <span>Confidential</span>
            <span>Proposal #{quote.metadata.proposalNumber}</span>
          </div>

          <div className="proposal-section-heading keep-with-next">
            <div className="section-heading-badge">Section C</div>
            <div className="proposal-overline">Optional field services</div>
            <h2 className="proposal-section-title">{quote.sections.sectionC.title}</h2>
            <p className="proposal-intro">
              {quote.sections.sectionC.introText ||
                "Optional field services can be included as budgetary or final pricing."}
            </p>
          </div>

          <table className="proposal-table sample-table">
            <thead>
              <tr>
                <th>Service Description</th>
                <th>Qty</th>
                <th>Unit Price</th>
                <th>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {quote.sections.sectionC.lineItems.map((row) => (
                <tr key={row.id} className="keep-together">
                  <td>
                    <div className="proposal-cell-title">{row.description}</div>
                    <div className="proposal-cell-subtitle">{getPricingLabel(row)}</div>
                    {row.notes && <div className="proposal-cell-note">{row.notes}</div>}
                  </td>
                  <td>{row.quantity}</td>
                  <td>{formatCurrency(row.unitPrice, currencyCode)}</td>
                  <td>{formatCurrency(row.totalPrice, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="proposal-total-row">
                <td colSpan={3}>Section C optional services total</td>
                <td>{formatCurrency(sectionCTotal, currencyCode)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <section className="proposal-page proposal-closing-page">
        <div className="proposal-confidential-mark">CONFIDENTIAL</div>
        <div className="proposal-corner-watermark" />
        <div className="proposal-header">
          <span>Confidential</span>
          <span>Proposal #{quote.metadata.proposalNumber}</span>
        </div>

        <div className="proposal-overline">Commercial recap</div>
        <h2 className="proposal-section-title">Summary of proposed pricing</h2>
        <div className="section-title-rule" />

        <div className="proposal-grand-totals">
          <div className="grand-total-card">
            <div className="grand-total-label">Recurring monthly</div>
            <div className="grand-total-value">{formatCurrency(recurringMonthlyTotal, currencyCode)}</div>
          </div>
          <div className="grand-total-card">
            <div className="grand-total-label">One-time equipment</div>
            <div className="grand-total-value">{formatCurrency(equipmentTotal, currencyCode)}</div>
          </div>
          {quote.sections.sectionC.enabled && (
            <div className="grand-total-card">
              <div className="grand-total-label">Optional services</div>
              <div className="grand-total-value">{formatCurrency(sectionCTotal, currencyCode)}</div>
            </div>
          )}
          {quote.metadata.quoteType === "lease" && (
            <div className="grand-total-card accent-card">
              <div className="grand-total-label">Estimated lease monthly</div>
              <div className="grand-total-value">{formatCurrency(leaseMonthly, currencyCode)}</div>
            </div>
          )}
        </div>

        <div className="proposal-copy proposal-copy-card closing-copy">
          <p>
            This proposal outlines the current commercial structure for review. Final scope, taxes, freight,
            installation assumptions, and delivery details may be refined in the next revision.
          </p>
          <p>
            Please sign below to indicate acceptance of this proposal and authorization for iNet to proceed with order
            processing based on the approved scope.
          </p>
        </div>

        <div className="approval-block keep-together sample-approval-block">
          <div className="approval-block-header">
            <div>
              <div className="proposal-overline">Customer approval</div>
              <h3 className="approval-title">Authorization to proceed</h3>
            </div>
            <div className="approval-status-chip">Order Approval</div>
          </div>

          <div className="approval-copy">
            By signing below, the customer confirms review and acceptance of the pricing and scope described in this
            proposal, subject to any mutually agreed revisions or final contract documents.
          </div>

          <div className="approval-signature-grid">
            <div className="signature-field">
              <div className="signature-line" />
              <div className="signature-label">Authorized customer signature</div>
            </div>
            <div className="signature-field">
              <div className="signature-line" />
              <div className="signature-label">Printed name / title</div>
            </div>
            <div className="signature-field">
              <div className="signature-line" />
              <div className="signature-label">Company</div>
            </div>
            <div className="signature-field">
              <div className="signature-line" />
              <div className="signature-label">Date</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

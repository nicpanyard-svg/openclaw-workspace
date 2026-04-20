import {
  buildProposalCommercialSummary,
  getEquipmentTotal,
  getLeaseMonthlyTotal,
  getOptionalServicesTotal,
  getRecurringMonthlyTotal,
} from "@/app/lib/proposal-commercial-summary";
import type { QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";

function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function paragraph(text: string) {
  return `<p>${escapeHtml(text)}</p>`;
}

function list(items: string[], ordered = false) {
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

function table(headers: string[], rows: string[][], footer?: string[]) {
  const head = `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  const foot = footer
    ? `<tfoot><tr>${footer.map((cell) => `<td>${cell}</td>`).join("")}</tr></tfoot>`
    : "";

  return `<table>${head}${body}${foot}</table>`;
}

function cleanLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function getPricingLabel(row: ServicePricingRow) {
  return row.pricingStage === "final" ? "Final" : "Budgetary";
}

function wrapInline(value: string) {
  return `<span>${escapeHtml(value)}</span>`;
}

export function buildProposalWordHtml(quote: QuoteRecord) {
  const currencyCode = quote.metadata.currencyCode || "USD";
  const sectionARows = quote.sections.sectionA.mode === "pool" ? quote.sections.sectionA.poolRows : quote.sections.sectionA.perKitRows;
  const recurringMonthlyTotal = getRecurringMonthlyTotal(quote);
  const equipmentTotal = getEquipmentTotal(quote);
  const sectionCTotal = getOptionalServicesTotal(quote);
  const leaseMonthly = getLeaseMonthlyTotal(quote, recurringMonthlyTotal, equipmentTotal);
  const executiveSummaryBlocks = [quote.executiveSummary.customerContext, quote.executiveSummary.body]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value?.length));
  const fallbackExecutiveSummary = quote.executiveSummary.paragraphs.filter((paragraph) => paragraph.trim().length > 0);
  const executiveSummaryParagraphs = executiveSummaryBlocks.length ? executiveSummaryBlocks : fallbackExecutiveSummary;
  const billToLines = cleanLines([
    quote.billTo.companyName ?? "",
    quote.billTo.attention ?? "",
    ...quote.billTo.lines,
  ]);
  const shipToSource = quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo;
  const shipToLines = cleanLines([
    shipToSource.companyName ?? "",
    shipToSource.attention ?? "",
    ...shipToSource.lines,
  ]);
  const customerVisibleCustomFields = (quote.customFields ?? []).filter(
    (field) => field.visibility === "customer" && (field.label.trim().length > 0 || field.value.trim().length > 0),
  );
  const pricingSnapshotItems = buildProposalCommercialSummary(quote).map((item) => ({
    ...item,
    value: formatCurrency(item.value, currencyCode),
  }));
  const oneTimeTotal = equipmentTotal + (quote.sections.sectionC.enabled ? sectionCTotal : 0);

  const sectionATable = quote.sections.sectionA.enabled
    ? table(
        ["Service Description", "Qty", "Unit Monthly", "Total Monthly"],
        sectionARows.map((row) => [
          [
            `<strong>${escapeHtml(row.description)}</strong>`,
            row.unitLabel && row.rowType !== "support" && row.rowType !== "terminal_fee"
              ? `<div class="subtle">${escapeHtml(row.unitLabel)}</div>`
              : "",
            row.rowType === "support" && row.includedText?.length
              ? `<div class="subtle">${list(row.includedText, false)}</div>`
              : "",
          ].join(""),
          escapeHtml(String(row.quantity ?? "—")),
          escapeHtml(
            row.rowType === "support"
              ? "Included with service"
              : formatCurrency(row.monthlyRate ?? row.unitPrice ?? 0, currencyCode),
          ),
          escapeHtml(row.rowType === "support" ? "Included" : formatCurrency(row.totalMonthlyRate ?? 0, currencyCode)),
        ]),
        [`<strong colspan="3">Total monthly recurring</strong>`, "", "", `<strong>${escapeHtml(formatCurrency(recurringMonthlyTotal, currencyCode))}</strong>`],
      )
    : "";

  const sectionBTable = quote.sections.sectionB.enabled
    ? table(
        ["Equipment Description", "Qty", "Unit Price", "Total Price"],
        quote.sections.sectionB.lineItems.map((row) => [
          [
            `<strong>${escapeHtml(row.itemName)}</strong>`,
            `<div class="subtle">${escapeHtml([row.itemCategory, row.terminalType, row.partNumber].filter(Boolean).join(" • ") || "Hardware line item")}</div>`,
            row.description ? `<div class="subtle">${escapeHtml(row.description)}</div>` : "",
          ].join(""),
          escapeHtml(String(row.quantity)),
          escapeHtml(formatCurrency(row.unitPrice, currencyCode)),
          escapeHtml(formatCurrency(row.totalPrice, currencyCode)),
        ]),
        [`<strong colspan="3">One-time equipment total</strong>`, "", "", `<strong>${escapeHtml(formatCurrency(equipmentTotal, currencyCode))}</strong>`],
      )
    : "";

  const sectionCTable = quote.sections.sectionC.enabled
    ? table(
        ["Service Description", "Qty", "Unit Price", "Total Price"],
        quote.sections.sectionC.lineItems.map((row) => [
          [
            `<strong>${escapeHtml(row.description)}</strong>`,
            `<div class="subtle">${escapeHtml(getPricingLabel(row))}</div>`,
            row.notes ? `<div class="subtle">${escapeHtml(row.notes)}</div>` : "",
          ].join(""),
          escapeHtml(String(row.quantity)),
          escapeHtml(formatCurrency(row.unitPrice, currencyCode)),
          escapeHtml(formatCurrency(row.totalPrice, currencyCode)),
        ]),
        [`<strong colspan="3">Field services total</strong>`, "", "", `<strong>${escapeHtml(formatCurrency(sectionCTotal, currencyCode))}</strong>`],
      )
    : "";

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <meta name="ProgId" content="Word.Document" />
    <meta name="Generator" content="RapidQuote" />
    <meta name="Originator" content="RapidQuote" />
    <title>${escapeHtml(quote.metadata.documentTitle)} - ${escapeHtml(quote.metadata.proposalNumber)}</title>
    <!--[if gte mso 9]>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
      @page { size: 8.5in 11in; margin: 0.6in; }
      body { font-family: Arial, Helvetica, sans-serif; color: #232a31; line-height: 1.35; font-size: 11pt; }
      h1, h2, h3, h4, p { margin: 0; }
      .doc { max-width: 7.3in; margin: 0 auto; }
      .hero, .section, .summary-card, .terms-card, .approval-card { border: 1px solid #dbe2e9; padding: 18px; margin-bottom: 16px; }
      .hero { background: #f8fafc; }
      .customer-brand { margin-bottom: 12px; }
      .customer-brand img { max-width: 180px; max-height: 72px; height: auto; width: auto; }
      .customer-brand-fallback { display: inline-block; padding: 10px 14px; border: 1px solid #dbe2e9; background: #ffffff; font-weight: 700; color: #18222c; }
      .eyebrow { text-transform: uppercase; letter-spacing: 0.15em; font-size: 8.5pt; color: #7a042e; font-weight: 700; margin-bottom: 8px; }
      .hero-grid, .party-grid, .metric-grid, .snapshot-grid, .approval-grid { width: 100%; border-collapse: collapse; }
      .party-grid td, .metric-grid td, .snapshot-grid td, .approval-grid td { vertical-align: top; width: 50%; padding: 0 12px 12px 0; }
      .metric-grid td { width: 33.333%; }
      .approval-grid td { width: 33.333%; }
      .muted { color: #60707f; }
      .subtle { color: #60707f; font-size: 9.5pt; margin-top: 4px; }
      .spacer { height: 8px; }
      .section-title { font-size: 18pt; color: #18222c; margin-bottom: 8px; }
      .section-copy { margin-top: 8px; }
      .summary-strip { margin-top: 16px; }
      .summary-pill { display: inline-block; border: 1px solid #dbe2e9; background: #fff; padding: 8px 12px; margin: 0 10px 10px 0; min-width: 150px; }
      .summary-pill strong { display: block; font-size: 12pt; color: #18222c; }
      .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.12em; color: #7a042e; font-weight: 700; margin-bottom: 5px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #dbe2e9; padding: 8px; text-align: left; vertical-align: top; }
      th { background: #f4f7fa; font-weight: 700; }
      ul, ol { margin: 8px 0 0 18px; padding: 0; }
      li { margin-bottom: 5px; }
      .signature-line { border-bottom: 1px solid #232a31; height: 28px; margin-bottom: 8px; }
      .page-break { page-break-before: always; }
    </style>
  </head>
  <body>
    <div class="doc">
      <section class="hero">
        <div class="eyebrow">iNet Communications Proposal</div>
        <h1 class="section-title">${escapeHtml(quote.metadata.documentTitle)}</h1>
        <p class="muted">${escapeHtml(quote.metadata.documentSubtitle)}</p>
        <div class="spacer"></div>
        <table class="party-grid">
          <tr>
            <td>
              <div class="label">Prepared for</div>
              ${quote.customer.logoDataUrl
                ? `<div class="customer-brand"><img src="${escapeHtml(quote.customer.logoDataUrl)}" alt="${escapeHtml(quote.customer.name)} logo" /></div>`
                : `<div class="customer-brand"><div class="customer-brand-fallback">${escapeHtml(quote.customer.logoText || quote.customer.name)}</div></div>`}
              <p><strong>${escapeHtml(quote.customer.name)}</strong></p>
              <p>${escapeHtml(quote.customer.contactName)}</p>
              <p>${escapeHtml(quote.customer.contactPhone)}</p>
              <p>${escapeHtml(quote.customer.contactEmail)}</p>
              ${quote.customer.addressLines.map(paragraph).join("")}
            </td>
            <td>
              <div class="label">${escapeHtml(quote.documentation.preparedByLabel ?? "Prepared by")}</div>
              <p><strong>${escapeHtml(quote.inet.contactName)}</strong></p>
              <p>${escapeHtml(quote.inet.name)}</p>
              <p>${escapeHtml(quote.inet.contactPhone)}</p>
              <p>${escapeHtml(quote.inet.contactEmail)}</p>
              ${quote.inet.addressLines.map(paragraph).join("")}
            </td>
          </tr>
        </table>
        <div class="summary-strip">
          ${pricingSnapshotItems
            .map(
              (item) => `<div class="summary-pill"><div class="label">${escapeHtml(item.label)}</div><strong>${escapeHtml(item.value)}</strong></div>`,
            )
            .join("")}
        </div>
      </section>

      <section class="section">
        <div class="eyebrow">Proposal overview</div>
        <h2 class="section-title">Proposal Information</h2>
        <table class="snapshot-grid">
          <tr>
            <td>
              <div class="label">Proposal</div>
              <p><strong>#${escapeHtml(quote.documentation.proposalNumberLabel)}</strong></p>
              <p class="muted">${escapeHtml(quote.documentation.proposalTitle)}</p>
            </td>
            <td>
              <div class="label">Date</div>
              <p><strong>${escapeHtml(quote.documentation.proposalDateLabel)}</strong></p>
              <p class="muted">Budgetary Estimate</p>
              <p class="subtle">Revision ${escapeHtml(quote.metadata.revisionVersion)}</p>
            </td>
          </tr>
          <tr>
            <td>
              <div class="label">Customer</div>
              <p><strong>${escapeHtml(quote.customer.contactName)}</strong></p>
              <p>${escapeHtml(quote.customer.contactPhone)}</p>
              <p>${escapeHtml(quote.customer.contactEmail)}</p>
              <div class="spacer"></div>
              <div class="label">${escapeHtml(quote.documentation.customerAddressHeading)}</div>
              ${quote.customer.addressLines.map(paragraph).join("")}
            </td>
            <td>
              <div class="label">${escapeHtml(quote.documentation.inetSalesHeading ?? "iNet")}</div>
              <p><strong>${escapeHtml(quote.inet.contactName)}</strong></p>
              <p>${escapeHtml(quote.inet.contactPhone)}</p>
              <p>${escapeHtml(quote.inet.contactEmail)}</p>
              <div class="spacer"></div>
              <div class="label">${escapeHtml(quote.documentation.inetAddressHeading)}</div>
              ${quote.inet.addressLines.map(paragraph).join("")}
            </td>
          </tr>
          <tr>
            <td>
              <div class="label">${escapeHtml(quote.documentation.billToHeading ?? "Bill To")}</div>
              ${billToLines.map(paragraph).join("")}
            </td>
            <td>
              <div class="label">${escapeHtml(quote.documentation.shipToHeading ?? "Ship To")}</div>
              ${shipToLines.map(paragraph).join("")}
              ${quote.shippingSameAsBillTo ? `<p class="subtle">Same as Bill To</p>` : ""}
            </td>
          </tr>
        </table>
        ${
          quote.executiveSummary.enabled && executiveSummaryParagraphs.length
            ? `<div class="summary-card"><div class="label">${escapeHtml(quote.executiveSummary.heading?.trim() || "Executive Summary")}</div>${executiveSummaryParagraphs.map(paragraph).join("")}</div>`
            : ""
        }
        ${
          customerVisibleCustomFields.length
            ? `<div class="summary-card"><div class="label">Additional Proposal Details</div>${customerVisibleCustomFields
                .map((field) => paragraph(`${field.label || "Detail"}${field.value ? ` ${field.value}` : ""}`))
                .join("")}</div>`
            : ""
        }
      </section>

      ${
        quote.sections.sectionA.enabled
          ? `<section class="section page-break"><div class="eyebrow">Recurring services</div><h2 class="section-title">${escapeHtml(quote.sections.sectionA.title)}</h2><p class="section-copy">${escapeHtml(quote.sections.sectionA.introText || `The pricing below reflects a ${quote.sections.sectionA.termMonths}-month commercial term.`)}</p>${(quote.sections.sectionA.explanatoryParagraphs ?? []).map(paragraph).join("")}${sectionATable}</section>`
          : ""
      }

      ${
        quote.sections.sectionB.enabled
          ? `<section class="section page-break"><div class="eyebrow">Equipment and accessories</div><h2 class="section-title">${escapeHtml(quote.sections.sectionB.title)}</h2><p class="section-copy">${escapeHtml(quote.sections.sectionB.introText || "The prices below reflect one-time hardware and accessory charges.")}</p>${sectionBTable}</section>`
          : ""
      }

      ${
        quote.sections.sectionC.enabled
          ? `<section class="section page-break"><div class="eyebrow">Field services</div><h2 class="section-title">${escapeHtml(quote.sections.sectionC.title)}</h2><p class="section-copy">${escapeHtml(quote.sections.sectionC.introText || "Field services can be included as budgetary or final pricing.")}</p>${sectionCTable}</section>`
          : ""
      }

      <section class="section page-break">
        <div class="eyebrow">Terms and conditions</div>
        <h2 class="section-title">${escapeHtml(quote.terms.generalStarlinkServiceTermsTitle)}</h2>
        <div class="terms-card">${list(quote.terms.generalStarlinkServiceTerms, true)}</div>
        <div class="eyebrow">Commercial terms</div>
        <h2 class="section-title">${escapeHtml(quote.terms.pricingTermsTitle)}</h2>
        <div class="terms-card">${list(quote.terms.pricingTerms, false)}</div>
      </section>

      <section class="section page-break">
        <div class="eyebrow">Commercial recap</div>
        <h2 class="section-title">Summary of proposed pricing</h2>
        <table class="metric-grid">
          <tr>
            <td><div class="label">Recurring monthly</div><p><strong>${escapeHtml(formatCurrency(recurringMonthlyTotal, currencyCode))}</strong></p></td>
            <td><div class="label">One-time equipment</div><p><strong>${escapeHtml(formatCurrency(equipmentTotal, currencyCode))}</strong></p></td>
            <td><div class="label">${escapeHtml(quote.sections.sectionC.enabled ? "One-time total" : "Proposal status")}</div><p><strong>${escapeHtml(quote.sections.sectionC.enabled ? formatCurrency(oneTimeTotal, currencyCode) : quote.metadata.status)}</strong></p></td>
          </tr>
        </table>
        ${quote.metadata.quoteType === "lease" ? `<p class="section-copy"><strong>Estimated lease monthly:</strong> ${escapeHtml(formatCurrency(leaseMonthly, currencyCode))}</p>` : ""}
        <div class="approval-card">
          <div class="label">${escapeHtml(quote.approval.heading)}</div>
          <h3>Authorization to proceed</h3>
          <p class="section-copy">By signing below, the customer confirms review and acceptance of the pricing and scope described in this proposal, subject to any mutually agreed revisions or final contract documents.</p>
          ${quote.approval.approvalNote ? `<p class="section-copy">${escapeHtml(quote.approval.approvalNote)}</p>` : ""}
          <table class="approval-grid">
            <tr>
              <td>${wrapInline("Scope")}<p><strong>Reviewed and accepted</strong></p></td>
              <td>${wrapInline("Commercials")}<p><strong>Approved to proceed</strong></p></td>
              <td>${wrapInline("Next step")}<p><strong>Release for order processing</strong></p></td>
            </tr>
          </table>
          <table class="approval-grid">
            <tr>
              <td><div class="signature-line"></div><div>${escapeHtml(quote.approval.signatureLabel)}</div></td>
              <td><div class="signature-line"></div><div>${escapeHtml(quote.approval.customerNameLabel)}</div></td>
              <td><div class="signature-line"></div><div>${escapeHtml(quote.approval.dateLabel)}</div></td>
            </tr>
          </table>
        </div>
      </section>
    </div>
  </body>
</html>`;
}

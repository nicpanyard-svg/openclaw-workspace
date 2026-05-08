import type { QuoteRecord, ServiceAgreementCategoryPricing } from "@/app/lib/quote-record";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value: number | null | undefined, currencyCode = "USD") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(value);
}

function rateBasisLabel(category: ServiceAgreementCategoryPricing) {
  if (category.rateBasis === "standard") return "Standard";
  if (category.rateBasis === "non_standard") return "Non-standard";
  return "N/A";
}

export async function buildServiceAgreementDocument(quote: QuoteRecord) {
  const profile = quote.serviceAgreement.profile;
  const activeCategories = profile.categories.filter((category) =>
    category.rateBasis !== "na" || category.laborRate !== null || category.mileageRate !== null || Boolean(category.notes?.trim()),
  );
  const safeProposalNumber = quote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";
  const currencyCode = quote.metadata.currencyCode || "USD";
  const agreementName = profile.agreementLabel || `${quote.customer.name} Service Agreement`;
  const customerName = quote.serviceAgreement.sourceCustomerProfileName || quote.customer.name || "Customer";

  const categoryRows = activeCategories.length
    ? activeCategories
        .map(
          (category) => `
            <tr>
              <td>${escapeHtml(category.label)}</td>
              <td>${escapeHtml(rateBasisLabel(category))}</td>
              <td>${escapeHtml(formatCurrency(category.laborRate, currencyCode))}</td>
              <td>${escapeHtml(formatCurrency(category.mileageRate, currencyCode))}</td>
              <td>${escapeHtml((category.notes || "").trim() || "—")}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No active SLA pricing categories are defined on this quote yet.</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(agreementName)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 40px; color: #16202b; }
    .header { border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
    .eyebrow { font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #60707f; }
    h1 { margin: 8px 0 4px; font-size: 28px; }
    h2 { margin: 28px 0 12px; font-size: 18px; }
    .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px 24px; margin-top: 18px; }
    .meta-card { border: 1px solid #d7e0e7; border-radius: 12px; padding: 12px 14px; background: #f8fbfc; }
    .meta-card strong { display:block; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #60707f; margin-bottom: 6px; }
    .notes { border: 1px solid #d7e0e7; border-radius: 12px; padding: 14px; background: #fff; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #d7e0e7; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #e8f4f1; color: #0f5f59; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .muted { color: #60707f; }
  </style>
</head>
<body>
  <div class="header">
    <div class="eyebrow">Standalone Service Agreement</div>
    <h1>${escapeHtml(agreementName)}</h1>
    <div class="muted">Prepared from RapidQuote proposal ${escapeHtml(quote.metadata.proposalNumber)} for ${escapeHtml(customerName)}.</div>
  </div>

  <div class="meta-grid">
    <div class="meta-card"><strong>Customer</strong>${escapeHtml(customerName)}</div>
    <div class="meta-card"><strong>Proposal</strong>${escapeHtml(quote.metadata.proposalNumber)}</div>
    <div class="meta-card"><strong>Signed date</strong>${escapeHtml(profile.signedDate || "Not recorded")}</div>
    <div class="meta-card"><strong>Accepted date</strong>${escapeHtml(profile.acceptedDate || "Not recorded")}</div>
    <div class="meta-card"><strong>Source file</strong>${escapeHtml(profile.sourceDocument?.fileName || "Not recorded")}</div>
    <div class="meta-card"><strong>Reference</strong>${escapeHtml(profile.sourceDocument?.fileUrl || profile.sourceDocument?.note || "Not recorded")}</div>
  </div>

  <h2>Agreement Notes</h2>
  <div class="notes">${escapeHtml((profile.notes || "").trim() || "No agreement notes recorded.")}</div>

  <h2>SLA Pricing Categories</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Rate Basis</th>
        <th>Labor Rate</th>
        <th>Mileage Rate</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${categoryRows}
    </tbody>
  </table>
</body>
</html>`;

  return {
    blob: new Blob([html], { type: "text/html;charset=utf-8" }),
    fileName: `${safeProposalNumber}-service-agreement.html`,
  };
}

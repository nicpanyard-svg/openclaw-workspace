import { applyMajorProjectToQuote, buildMajorProjectMetrics } from "./major-project";
import { finalReviewConfirmed, getFinalPaymentTerms } from "./final-quote-review";
import { missingProcessingRequirements } from "./processing-requirements";
import { getIncludedEquipmentRows, getIncludedSectionARows, getIncludedServiceRows, getLeasePricingSummary, getQuotedSalesTax, getProposalOptionCostSummary } from "./proposal-commercial-summary";
import { getAnnualSubscriptionSummary } from "./quote-line-billing";
import { getQuoteBranding } from "./quote-branding";
import { buildProposalPdfFileName } from "./proposal-file-name";
import { normalizeProFormaSettings } from "./pro-forma-settings";
import type { QuoteRecord } from "./quote-record";

export type ProFormaLine = {
  id: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  billing: "One-time" | "First month" | "Year 1 annual" | "Year 1 included";
};

export function buildProFormaInvoice(source: QuoteRecord) {
  const major = source.metadata.workflowMode === "major_project" && source.majorProject?.enabled;
  const quote = major ? applyMajorProjectToQuote(source) : source;
  const settings = normalizeProFormaSettings(quote.proForma) ?? { reference: `PF-${quote.metadata.proposalNumber}`, issueDate: "", customerPo: "", billingPeriod: "", notes: "" };
  const branding = getQuoteBranding(quote);
  const errors: string[] = [];
  const lines: ProFormaLine[] = [];
  const cents = (value: number) => Number(value.toFixed(2));
  const add = (id: string, description: string, quantity: number | null | undefined, amount: number, billing: ProFormaLine["billing"]) => {
    if (!description.trim() && !amount) return;
    if (!description.trim()) errors.push("Every invoice item needs a description.");
    if (!Number.isFinite(amount) || (quantity != null && (!Number.isFinite(quantity) || quantity <= 0))) errors.push(`Review the quantity and price for ${description || "an invoice item"}.`);
    // Preserve the quote's extended amount; unknown quantities must not become invented unit prices.
    const safeAmount = Number.isFinite(amount) ? cents(amount) : 0;
    const safeQuantity = quantity != null && Number.isFinite(quantity) && quantity > 0 ? quantity : null;
    lines.push({ id, description, quantity: safeQuantity, unitPrice: safeQuantity ? safeAmount / safeQuantity : null, amount: safeAmount, billing });
  };
  const recurring = getIncludedSectionARows(quote);
  const equipment = getIncludedEquipmentRows(quote);
  const services = getIncludedServiceRows(quote);
  const annual = getAnnualSubscriptionSummary(quote);
  const lease = getLeasePricingSummary(quote);
  const isLease = quote.metadata.quoteType === "lease";
  if (!isLease) equipment.forEach(row => add(`equipment-${row.id}`, row.itemName, row.quantity, row.totalPrice, "One-time"));
  services.forEach(row => add(`service-${row.id}`, row.description, row.quantity, row.totalPrice, "One-time"));
  if (isLease && equipment.length) add("equipment-lease", `Equipment lease (${lease.termMonths}-month term)`, 1, lease.hardwareMonthly, "First month");
  recurring.filter(row => row.rowType !== "overage").forEach(row => add(`monthly-${row.id}`, row.description, row.quantity, row.totalMonthlyRate ?? 0, "First month"));
  annual.items.forEach(row => add(`annual-${row.key}`, row.label, row.quantity, row.firstYearAmount, row.startsYear === 2 ? "Year 1 included" : "Year 1 annual"));

  const date = settings.issueDate;
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) errors.push("Enter a valid invoice date.");
  if (!settings.reference.trim()) errors.push("Enter a pro forma invoice reference.");
  if (!quote.metadata.proposalNumber.trim()) errors.push("Add a quote reference.");
  if (!quote.customer.name.trim()) errors.push("Choose a customer.");
  if (!lines.length) errors.push("Add at least one included quote item.");
  if (isLease && !quote.metadata.hasActiveDataAgreement) errors.push("Confirm the active data agreement for this lease.");
  if (major) errors.push(...buildMajorProjectMetrics(source).validation.issues.filter(issue => issue.severity === "error").map(issue => issue.message));
  errors.push(...missingProcessingRequirements(quote));
  if (!finalReviewConfirmed(quote)) errors.push("Confirm the quote details on the Review tab.");
  if (quote.metadata.salesTaxAmount != null && (!Number.isFinite(quote.metadata.salesTaxAmount) || quote.metadata.salesTaxAmount < 0)) errors.push("Review the quoted sales tax.");

  const subtotal = cents(lines.reduce((sum, line) => sum + line.amount, 0));
  const tax = getQuotedSalesTax(quote);
  const monthly = cents(lines.filter(line => line.billing === "First month").reduce((sum, line) => sum + line.amount, 0));
  if (![subtotal, tax, subtotal + tax, monthly, annual.renewalTotal].every(Number.isFinite)) errors.push("Invoice amounts exceed the supported range.");
  let currency = quote.metadata.currencyCode || "USD";
  try { new Intl.NumberFormat("en-US", { style: "currency", currency }).format(0); }
  catch { errors.push("Choose a valid quote currency."); currency = "USD"; }
  const shipping = quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo;
  const address = (values: string[]) => values.map(line => line.trim()).filter(Boolean);
  return {
    settings, quoteReference: quote.metadata.proposalNumber, quoteRevision: quote.metadata.revisionVersion,
    quoteTitle: quote.metadata.documentTitle, currency,
    company: { name: quote.inet.name || branding.provider.name, address: address(quote.inet.addressLines), phone: quote.inet.contactPhone, email: quote.inet.contactEmail },
    billTo: { name: quote.billTo.companyName?.trim() || quote.customer.name, contact: quote.billTo.attention?.trim() || quote.customer.contactName, address: address(quote.billTo.lines).length ? address(quote.billTo.lines) : address(quote.customer.addressLines), email: quote.customer.contactEmail },
    shipTo: quote.orderProcessing?.shippingRequired === "yes" ? { name: shipping.companyName?.trim() || quote.customer.name, contact: shipping.attention || "", address: address(shipping.lines) } : null,
    logoSrc: branding.logoSrc, accent: branding.primaryColor,
    lines, subtotal, tax, total: cents(subtotal + tax), monthly,
    renewals: annual.items.map(row => ({ id: row.key, description: row.label, amount: row.annualAmount })), annualRenewal: annual.renewalTotal,
    leasedEquipment: isLease ? equipment.map(row => ({ description: row.itemName, quantity: row.quantity })) : [],
    paymentTerms: getFinalPaymentTerms(quote), billingStart: quote.customerOutput?.billingStart || "",
    optionalExcluded: getProposalOptionCostSummary(quote).items.length > 0,
    usageExcluded: recurring.some(row => row.rowType === "overage"),
    errors: [...new Set(errors)],
  };
}

export type ProFormaInvoice = ReturnType<typeof buildProFormaInvoice>;

export function buildProFormaFileName(quote: QuoteRecord) {
  return buildProposalPdfFileName(quote).replace(/\.pdf$/, " - Pro Forma Invoice.pdf");
}

import type { QuoteCustomerOutput, QuoteRecord } from "./quote-record";
import { getIncludedEquipmentRows, getIncludedSectionARows, getIncludedServiceRows } from "./proposal-commercial-summary";
import { isSoftwareLine } from "./quote-software";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCustomerOutput(value: unknown): QuoteCustomerOutput {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    ...(text(source.fieldServiceConfirmation) ? { fieldServiceConfirmation: text(source.fieldServiceConfirmation) } : {}),
    leaseEndTerms: text(source.leaseEndTerms),
    postLeaseTerms: text(source.postLeaseTerms),
    deliveryLeadTime: text(source.deliveryLeadTime),
    billingStart: text(source.billingStart),
  };
}

// These are generated editor defaults, not customer-authored scope descriptions.
const authoringPatterns = [
  /^manual row\.?$/i,
  /^base deployment structure\.?$/i,
  /^use this (section|quote-level section|placeholder package)/i,
  /^hardware lines are flowing directly/i,
  /^service lines are flowing directly/i,
  /^service and installation lines are flowing directly/i,
  /^customer-facing (hardware|services) (?:is|are) rolled up from internal bundles/i,
  /^hardware totals are generated from the major project commercial model/i,
  /^services and allowances are generated from the major project commercial model/i,
  /^generated directly from the major project component list/i,
  /^generated from major project (row builder|model)/i,
  /^built from Major Project row buckets with live margin rollups/i,
  /^internal monthly cost\s/i,
  /^internal components flow/i,
  /^internal validation flagged/i,
  /^contract math is driven by/i,
  /^customer-facing quote lines are presentation only/i,
  /^MRR structure based on/i,
  /^Recurring Starlink-related pricing and one-time integration pricing may be governed by different commercial assumptions inside the same proposal\.?$/i,
  /internal cost.*(?:margin|revenue)/i,
  /^(manufacturer warranty coverage, exclusions, and any registration requirements should be confirmed)/i,
];

export function customerCopy(value: unknown): string {
  const copy = text(value);
  return copy.split(/(?<=[.!?])\s+(?=[A-Z])|\r?\n/)
    .filter((line) => !authoringPatterns.some((pattern) => pattern.test(line.trim())))
    .join("\n").trim();
}

function isPlaceholder(value: string) {
  return /\bplaceholder\b|legal terms are still being finalized|must be replaced with approved|replace.*approved final|must be reviewed before (?:customer )?release/i.test(value);
}

const legacyServiceTerm = "Pricing for Pool for Starlink Service is based upon a 12 Month Term upon date of agreement between both parties.";

export function getFieldServiceConfirmationKey(quote: QuoteRecord) {
  return JSON.stringify(getIncludedServiceRows(quote).map((row) => ({
    id: row.id, description: row.description, quantity: row.quantity, unitLabel: row.unitLabel,
    unitPrice: row.unitPrice, totalPrice: row.totalPrice, notes: row.notes,
  })));
}

export function getCustomerQuoteContent(quote: QuoteRecord) {
  const settings = normalizeCustomerOutput(quote.customerOutput);
  const services = getIncludedSectionARows(quote);
  const equipment = getIncludedEquipmentRows(quote);
  const fieldServices = getIncludedServiceRows(quote);
  const fieldServicePricingConfirmed = quote.metadata.workflowMode === "major_project" && fieldServices.length > 0
    && settings.fieldServiceConfirmation === getFieldServiceConfirmationKey(quote);
  const serviceTermMonths = Math.max(1, quote.sections.sectionA.termMonths || 12);
  const warnings: string[] = [];
  const rawTerms = [...quote.terms.generalStarlinkServiceTerms, ...quote.terms.pricingTerms];
  const placeholderTerms = rawTerms.some(isPlaceholder)
    || isPlaceholder(quote.terms.generalStarlinkServiceTermsTitle)
    || isPlaceholder(quote.terms.pricingTermsTitle);
  if (placeholderTerms) warnings.push("Applicable terms require confirmation.");
  if (!services.length && !equipment.length && !fieldServices.length) warnings.push("No included scope has been selected.");

  const pricingTerms = quote.terms.pricingTerms.flatMap((value) => {
    const line = customerCopy(value);
    if (!line || isPlaceholder(line)) return [];
    if (line === legacyServiceTerm) {
      return services.length ? [`Recurring service pricing is based on a ${serviceTermMonths}-month subscription commitment.`] : [];
    }
    if (/^Term for individual Kits is specific to individual Service Order/i.test(line)) return [];
    if (!services.length && /^Starlink reserves the right to modify its pricing at any time with 30 days/i.test(line)) return [];
    if (/^This quote is valid for 30 days/i.test(line) && text(quote.metadata.expirationDate)) return [];
    if (/^Pricing is in US Dollars\.$/i.test(line)) return [];
    return [line];
  });
  const serviceTerms = services.length ? quote.terms.generalStarlinkServiceTerms
    .map(customerCopy).filter((line) => line && !isPlaceholder(line)) : [];
  const serviceIntro = customerCopy(quote.sections.sectionA.introText)
    .replace(/^The pricing provided in the following table is based upon 12 Month Term\.\s*/i, "");
  const serviceNotes = (quote.sections.sectionA.explanatoryParagraphs ?? []).map(customerCopy).filter(Boolean);
  const equipmentIntro = customerCopy(quote.sections.sectionB.introText);
  const fieldServiceIntro = customerCopy(quote.sections.sectionC.introText);
  if (services.length) {
    [...pricingTerms, ...serviceTerms, serviceIntro, ...serviceNotes].flatMap((line) => line.split(/\n|;/)).forEach((line) => {
      if ((/lease/i.test(line) && !/subscription|recurring service/i.test(line)) || !/service|subscription|commitment|\bterm\b/i.test(line)) return;
      const terms = [...line.matchAll(/\b(\d+)\s*[- ]?month(?:s)?\b/gi)];
      if (terms.some((match) => Number(match[1]) !== serviceTermMonths)) warnings.push("The written service term differs from the subscription commitment.");
    });
  }
  if (!pricingTerms.length && !serviceTerms.length) warnings.push("Commercial terms have not been specified.");

  const isLease = quote.metadata.quoteType === "lease";
  if (isLease) {
    if (!quote.metadata.hasActiveDataAgreement) warnings.push("The active data agreement has not been confirmed.");
    if (!settings.leaseEndTerms) warnings.push("End-of-lease equipment arrangements are to be confirmed.");
    if (!settings.postLeaseTerms) warnings.push("Pricing after the equipment lease is to be confirmed.");
  }
  const hasOverages = services.some((row) => row.rowType === "overage");
  const overageOptIn = quote.orderProcessing?.overageOptIn ?? "pending";
  if (hasOverages && overageOptIn === "pending") warnings.push("The overage election has not been confirmed.");
  if (overageOptIn === "yes" && services.length && !hasOverages) warnings.push("Opted-in overage pricing has not been specified.");
  if (!fieldServicePricingConfirmed && fieldServices.some((row) => row.pricingStage === "budgetary" && !isSoftwareLine(row))) warnings.push("Implementation and service pricing is budgetary and subject to confirmation based on final site count, configuration, and deployment requirements.");
  if (!fieldServicePricingConfirmed && fieldServices.some((row) => row.pricingStage === "budgetary" && isSoftwareLine(row))) warnings.push("Software pricing is budgetary and subject to confirmation of the final license scope and configuration.");

  const title = customerCopy(quote.metadata.documentTitle)
    || (quote.metadata.workflowMode === "major_project" ? customerCopy(quote.majorProject.summary.projectName) : "")
    || (isLease ? "Equipment Lease & Services" : "Equipment & Services Proposal");
  const subtitle = quote.metadata.documentSubtitle === "Major Project Commercial Proposal"
    ? "" : customerCopy(quote.metadata.documentSubtitle);
  const scope = quote.metadata.workflowMode === "major_project"
    ? customerCopy(quote.majorProject.summary.projectDescription) : "";
  const warranty = quote.warranty.enabled && equipment.length
    ? [quote.warranty.manufacturerReference, quote.warranty.coverageNote, quote.warranty.claimNote]
      .map(customerCopy).filter(Boolean) : [];

  return {
    settings, title, subtitle, scope, serviceTermMonths, serviceTerms, pricingTerms, warranty,
    serviceIntro, serviceNotes, fieldServiceIntro, fieldServicePricingConfirmed,
    equipmentIntro: isLease ? equipmentIntro.replace(/^The prices below reflect one-time connectivity hardware, router, and installation material charges\.\s*/i, "") : equipmentIntro,
    serviceTermsTitle: isPlaceholder(quote.terms.generalStarlinkServiceTermsTitle) ? "Service terms" : customerCopy(quote.terms.generalStarlinkServiceTermsTitle) || "Service terms",
    approvalNote: quote.approval.approvalNote?.trim() === "Customer Name:" ? "" : customerCopy(quote.approval.approvalNote),
    warnings: [...new Set(warnings)],
    isDraft: warnings.length > 0 || quote.metadata.status === "draft" || quote.metadata.status === "in_review",
    approvalReady: warnings.length === 0,
  };
}

import {
  getEquipmentTotal,
  getCustomerFacingOneTimeTotal,
  getIncludedEquipmentRows,
  getIncludedSectionARows,
  getIncludedServiceRows,
  getOptionalServicesTotal,
  getProposalOptionCostSummary,
  getRecurringMonthlyTotal,
  type ProposalOptionCostItem,
} from "@/app/lib/proposal-commercial-summary";
import { getQuoteBranding, resolveQuoteOutputTemplateKey } from "@/app/lib/quote-branding";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { getAnnualSubscriptionSummary } from "./quote-line-billing";

export type EstimateTemplateLineItem = {
  id: string;
  sequence: number;
  label: string;
  description?: string;
  quantity?: number | null;
  unit?: string | null;
  rate: number;
  amount: number;
  schedule: "one_time" | "monthly";
};

export type EstimateTemplateModel = {
  monthlyTotal: number;
  annual: ReturnType<typeof getAnnualSubscriptionSummary>;
  optionCostAnnualTotal: number;
  companyLabel: string;
  companyLegalName: string;
  logoSrc: string;
  proposalNumber: string;
  proposalDate: string;
  expirationDate: string;
  documentTitle: string;
  documentSubtitle: string;
  billToLines: string[];
  shipToLines: string[];
  providerLines: string[];
  providerPreparedBy: string;
  lineItems: EstimateTemplateLineItem[];
  optionCostItems: ProposalOptionCostItem[];
  optionCostMonthlyTotal: number;
  optionCostOneTimeTotal: number;
  subtotal: number;
  salesTaxAmount: number;
  total: number;
  paymentTerms?: string;
  noteParagraphs: string[];
  signatureHeading: string;
  signatureNote?: string;
};

function cleanLines(lines: Array<string | null | undefined>) {
  return lines.map((line) => (line ?? "").trim()).filter(Boolean);
}

function joinDescription(parts: Array<string | null | undefined>) {
  const value = parts.map((part) => (part ?? "").trim()).filter(Boolean).join(" • ");
  return value || undefined;
}

function extractPaymentTerms(quote: QuoteRecord) {
  const explicitPaymentTerms = quote.majorProject?.summary?.paymentTerms?.trim();
  if (explicitPaymentTerms) {
    return explicitPaymentTerms;
  }

  return quote.terms.pricingTerms.find((term) => /payment terms?/i.test(term))?.trim();
}

function buildNoteParagraphs(quote: QuoteRecord) {
  const paragraphs = [
    ...((quote.executiveSummary.paragraphs ?? []).map((paragraph) => paragraph.trim()).filter(Boolean)),
    quote.approval.approvalNote?.trim() || "",
  ].filter(Boolean);

  return Array.from(new Set(paragraphs));
}

function buildEstimateLineItems(quote: QuoteRecord): EstimateTemplateLineItem[] {
  const lineItems: EstimateTemplateLineItem[] = [];
  let sequence = 1;

  const sectionARows = getIncludedSectionARows(quote);
  if (quote.sections.sectionA.enabled) {
    sectionARows.forEach((row) => {
      const amount = row.totalMonthlyRate ?? row.monthlyRate ?? row.unitPrice ?? 0;
      if (!amount && !row.description.trim()) {
        return;
      }
      lineItems.push({
        id: row.id,
        sequence: sequence++,
        label: row.description,
        description: joinDescription([...(row.includedText ?? []), row.sourceLabel]),
        quantity: row.quantity ?? null,
        unit: row.unitLabel ?? null,
        rate: row.monthlyRate ?? row.unitPrice ?? amount,
        amount,
        schedule: "monthly",
      });
    });
  }

  if (quote.sections.sectionB.enabled) {
    getIncludedEquipmentRows(quote).forEach((row) => {
      lineItems.push({
        id: row.id,
        sequence: sequence++,
        label: row.itemName,
        description: joinDescription([row.partNumber, row.description, row.sourceLabel]),
        quantity: row.quantity,
        unit: row.itemCategory ?? null,
        rate: row.unitPrice,
        amount: row.totalPrice,
        schedule: "one_time",
      });
    });
  }

  if (quote.sections.sectionC.enabled) {
    getIncludedServiceRows(quote).forEach((row) => {
      lineItems.push({
        id: row.id,
        sequence: sequence++,
        label: row.description,
        description: joinDescription([row.notes, row.sourceLabel]),
        quantity: row.quantity,
        unit: row.unitLabel ?? null,
        rate: row.unitPrice,
        amount: row.totalPrice,
        schedule: "one_time",
      });
    });
  }

  return lineItems;
}

export function buildEstimateTemplateModel(quote: QuoteRecord): EstimateTemplateModel | null {
  if (resolveQuoteOutputTemplateKey(quote) !== "estimate_compact") {
    return null;
  }

  const branding = getQuoteBranding(quote);
  const optionCostSummary = getProposalOptionCostSummary(quote);
  const salesTaxAmount = quote.metadata.salesTaxAmount ?? 0;
  const annual = getAnnualSubscriptionSummary(quote);
  const subtotal = annual.items.length ? getCustomerFacingOneTimeTotal(quote) - salesTaxAmount + annual.firstYearTotal
    : getRecurringMonthlyTotal(quote) + getEquipmentTotal(quote) + getOptionalServicesTotal(quote);
  const providerLines = cleanLines([
    quote.inet.name || branding.provider.name,
    quote.inet.contactName,
    quote.inet.contactEmail,
    quote.inet.contactPhone,
    ...quote.inet.addressLines,
  ]);

  return {
    annual,
    monthlyTotal: getRecurringMonthlyTotal(quote),
    optionCostAnnualTotal: optionCostSummary.annualTotal,
    companyLabel: branding.shortName,
    companyLegalName: branding.legalName,
    logoSrc: branding.logoSrc,
    proposalNumber: quote.metadata.proposalNumber,
    proposalDate: quote.metadata.proposalDate,
    expirationDate: quote.metadata.expirationDate?.trim() || "",
    documentTitle: quote.metadata.documentTitle,
    documentSubtitle: quote.metadata.documentSubtitle,
    billToLines: cleanLines([quote.billTo.companyName, quote.billTo.attention, ...quote.billTo.lines]),
    shipToLines: cleanLines([
      quote.shippingSameAsBillTo ? quote.billTo.companyName : quote.shipTo.companyName,
      quote.shippingSameAsBillTo ? quote.billTo.attention : quote.shipTo.attention,
      ...(quote.shippingSameAsBillTo ? quote.billTo.lines : quote.shipTo.lines),
    ]),
    providerLines,
    providerPreparedBy: quote.inet.contactName || branding.provider.contactName,
    lineItems: buildEstimateLineItems(quote),
    optionCostItems: optionCostSummary.items,
    optionCostMonthlyTotal: optionCostSummary.monthlyTotal,
    optionCostOneTimeTotal: optionCostSummary.oneTimeTotal,
    subtotal,
    salesTaxAmount,
    total: subtotal + salesTaxAmount,
    paymentTerms: extractPaymentTerms(quote),
    noteParagraphs: buildNoteParagraphs(quote),
    signatureHeading: quote.approval.heading,
    signatureNote: quote.approval.approvalNote?.trim() || undefined,
  };
}

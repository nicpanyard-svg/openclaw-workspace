import type {
  PerKitPricingRow,
  PoolPricingRow,
  QuoteRecord,
  ServicePricingRow,
} from "@/app/lib/quote-record";

export type ProposalPdfViewModel = {
  proposalNumber: string;
  customerVisibleCustomFields: QuoteRecord["customFields"];
  proposalDate: string;
  documentTitle: string;
  documentSubtitle: string;
  customerName: string;
  customerLogoText?: string;
  customerLogoDataUrl?: string;
  customerContactName: string;
  customerContactPhone: string;
  customerContactEmail: string;
  customerAddressLines: string[];
  inetContactName: string;
  inetName: string;
  inetContactPhone: string;
  inetContactEmail: string;
  inetAddressLines: string[];
  billToLines: string[];
  shipToLines: string[];
  shippingSameAsBillTo: boolean;
  executiveSummaryEnabled: boolean;
  executiveSummaryHeading: string;
  executiveSummaryParagraphs: string[];
  sectionAEnabled: boolean;
  sectionATitle: string;
  sectionAIntro: string;
  sectionAExplanatoryParagraphs: string[];
  sectionARows: Array<PoolPricingRow | PerKitPricingRow>;
  recurringMonthlyTotal: number;
  sectionBEnabled: boolean;
  sectionBTitle: string;
  sectionBIntro: string;
  equipmentRows: QuoteRecord["sections"]["sectionB"]["lineItems"];
  equipmentTotal: number;
  sectionCEnabled: boolean;
  sectionCTitle: string;
  sectionCIntro: string;
  serviceRows: ServicePricingRow[];
  serviceTotal: number;
  quoteType: QuoteRecord["metadata"]["quoteType"];
  leaseMonthly: number;
  currencyCode: string;
  terms: QuoteRecord["terms"];
  approval: QuoteRecord["approval"];
  documentation: QuoteRecord["documentation"];
};

export function formatCurrency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function cleanLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function getSectionARows(sectionA: QuoteRecord["sections"]["sectionA"]) {
  return sectionA.mode === "pool" ? sectionA.poolRows : sectionA.perKitRows;
}

function getSectionATotal(rows: Array<PoolPricingRow | PerKitPricingRow>) {
  return Number(rows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2));
}

function getSectionBTotal(quote: QuoteRecord) {
  return Number(quote.sections.sectionB.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2));
}

function getSectionCTotal(quote: QuoteRecord) {
  return Number(quote.sections.sectionC.lineItems.reduce((sum, row) => sum + row.totalPrice, 0).toFixed(2));
}

function getLeaseMonthly(quote: QuoteRecord, recurringMonthlyTotal: number, equipmentTotal: number) {
  if (quote.metadata.quoteType !== "lease") return 0;
  const term = Math.max(quote.sections.sectionA.termMonths || 1, 1);
  return Number((recurringMonthlyTotal + equipmentTotal / term).toFixed(2));
}

export function buildProposalPdfViewModel(quote: QuoteRecord): ProposalPdfViewModel {
  const sectionARows = getSectionARows(quote.sections.sectionA);
  const recurringMonthlyTotal = getSectionATotal(sectionARows);
  const equipmentTotal = getSectionBTotal(quote);
  const serviceTotal = getSectionCTotal(quote);
  const leaseMonthly = getLeaseMonthly(quote, recurringMonthlyTotal, equipmentTotal);

  const executiveSummaryBlocks = [quote.executiveSummary.customerContext, quote.executiveSummary.body]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value?.length));
  const customerVisibleCustomFields = (quote.customFields ?? []).filter(
    (field) => field.visibility === "customer" && (field.label.trim().length > 0 || field.value.trim().length > 0),
  );
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

  return {
    proposalNumber: quote.metadata.proposalNumber,
    customerVisibleCustomFields,
    proposalDate: quote.metadata.proposalDate,
    documentTitle: quote.metadata.documentTitle,
    documentSubtitle: quote.metadata.documentSubtitle,
    customerName: quote.customer.name,
    customerLogoText: quote.customer.logoText,
    customerLogoDataUrl: quote.customer.logoDataUrl,
    customerContactName: quote.customer.contactName,
    customerContactPhone: quote.customer.contactPhone,
    customerContactEmail: quote.customer.contactEmail,
    customerAddressLines: quote.customer.addressLines,
    inetContactName: quote.inet.contactName,
    inetName: quote.inet.name,
    inetContactPhone: quote.inet.contactPhone,
    inetContactEmail: quote.inet.contactEmail,
    inetAddressLines: quote.inet.addressLines,
    billToLines,
    shipToLines,
    shippingSameAsBillTo: quote.shippingSameAsBillTo,
    executiveSummaryEnabled: quote.executiveSummary.enabled,
    executiveSummaryHeading: quote.executiveSummary.heading?.trim() || "Executive Summary",
    executiveSummaryParagraphs,
    sectionAEnabled: quote.sections.sectionA.enabled,
    sectionATitle: quote.sections.sectionA.title,
    sectionAIntro:
      quote.sections.sectionA.introText ||
      `The pricing below reflects a ${quote.sections.sectionA.termMonths}-month commercial term.`,
    sectionAExplanatoryParagraphs: quote.sections.sectionA.explanatoryParagraphs ?? [],
    sectionARows,
    recurringMonthlyTotal,
    sectionBEnabled: quote.sections.sectionB.enabled,
    sectionBTitle: quote.sections.sectionB.title,
    sectionBIntro:
      quote.sections.sectionB.introText || "The prices below reflect one-time hardware and accessory charges.",
    equipmentRows: quote.sections.sectionB.lineItems,
    equipmentTotal,
    sectionCEnabled: quote.sections.sectionC.enabled,
    sectionCTitle: quote.sections.sectionC.title,
    sectionCIntro:
      quote.sections.sectionC.introText || "Optional field services can be included as budgetary or final pricing.",
    serviceRows: quote.sections.sectionC.lineItems,
    serviceTotal,
    quoteType: quote.metadata.quoteType,
    leaseMonthly,
    currencyCode: quote.metadata.currencyCode || "USD",
    terms: quote.terms,
    approval: quote.approval,
    documentation: quote.documentation,
  };
}

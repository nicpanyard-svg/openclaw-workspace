import { COMPANY_BRANDING, getCompanyBranding } from "@/app/lib/company-branding";
import type { RapidQuoteCompanyKey, RapidQuoteOutputTemplateKey } from "@/app/lib/branding-types";
import type { QuoteRecord } from "@/app/lib/quote-record";

function normalizeDateLabel(dateLabel: string) {
  const parsed = new Date(dateLabel);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function resolveQuoteCompanyKey(quote: QuoteRecord): RapidQuoteCompanyKey {
  return quote.metadata.companyKey ?? "inet";
}

export function resolveQuoteOutputTemplateKey(quote: QuoteRecord): RapidQuoteOutputTemplateKey {
  const company = getCompanyBranding(resolveQuoteCompanyKey(quote));
  const selected = quote.metadata.outputTemplateKey;
  if (selected && company.allowedOutputTemplateKeys.includes(selected)) {
    return selected;
  }
  return company.defaultOutputTemplateKey;
}

export function getQuoteBranding(quote: QuoteRecord) {
  return getCompanyBranding(resolveQuoteCompanyKey(quote));
}

export function buildDefaultExpirationDate(proposalDate: string, companyKey: RapidQuoteCompanyKey) {
  const company = COMPANY_BRANDING[companyKey];
  const expirationDays = company.defaults.expirationDays;
  if (!expirationDays) {
    return "";
  }

  const parsed = normalizeDateLabel(proposalDate);
  if (!parsed) {
    return "";
  }

  const expirationDate = new Date(parsed);
  expirationDate.setDate(expirationDate.getDate() + expirationDays);
  return formatDateLabel(expirationDate);
}

export function applyCompanyBrandingToQuote(quote: QuoteRecord, companyKey: RapidQuoteCompanyKey) {
  const branding = COMPANY_BRANDING[companyKey];

  quote.metadata.companyKey = companyKey;
  quote.metadata.outputTemplateKey = branding.defaultOutputTemplateKey;
  quote.metadata.documentTitle = branding.defaults.documentTitle;
  quote.metadata.documentSubtitle = branding.defaults.documentSubtitle;
  quote.metadata.expirationDate = buildDefaultExpirationDate(quote.metadata.proposalDate, companyKey);
  quote.documentation.proposalTitle = branding.defaults.documentTitle;
  quote.documentation.proposalDateLabel = quote.metadata.proposalDate;
  quote.documentation.proposalNumberLabel = quote.metadata.proposalNumber;
  quote.documentation.customerAddressHeading = branding.defaults.customerAddressHeading;
  quote.documentation.inetAddressHeading = branding.defaults.providerAddressHeading;
  quote.documentation.preparedByLabel = branding.defaults.preparedByLabel;
  quote.documentation.inetSalesHeading = branding.defaults.providerHeading;
  quote.documentation.billToHeading = branding.defaults.billToHeading;
  quote.documentation.shipToHeading = branding.defaults.shipToHeading;
  quote.inet.name = branding.provider.name;
  quote.inet.contactName = branding.provider.contactName;
  quote.inet.contactPhone = branding.provider.contactPhone;
  quote.inet.contactEmail = branding.provider.contactEmail;
  quote.inet.addressLines = [...branding.provider.addressLines];
}

export function applyOutputTemplateToQuote(quote: QuoteRecord, templateKey: RapidQuoteOutputTemplateKey) {
  quote.metadata.outputTemplateKey = templateKey;
  if (templateKey === "estimate_compact" && !quote.metadata.expirationDate?.trim()) {
    quote.metadata.expirationDate = buildDefaultExpirationDate(quote.metadata.proposalDate, resolveQuoteCompanyKey(quote));
  }
}

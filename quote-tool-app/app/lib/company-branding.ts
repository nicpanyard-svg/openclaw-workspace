import type { RapidQuoteCompanyKey, RapidQuoteOutputTemplateKey } from "@/app/lib/branding-types";

export type RapidQuoteCompanyDefaults = {
  documentTitle: string;
  documentSubtitle: string;
  proposalDateLabel?: string;
  customerAddressHeading: string;
  providerAddressHeading: string;
  preparedByLabel: string;
  providerHeading: string;
  billToHeading: string;
  shipToHeading: string;
  expirationDays?: number;
};

export type RapidQuoteProviderDefaults = {
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLines: string[];
};

export type RapidQuoteCompanyBranding = {
  key: RapidQuoteCompanyKey;
  label: string;
  legalName: string;
  shortName: string;
  appLabel: string;
  proposalBannerText: string;
  logoSrc: string;
  logoAlt: string;
  primaryColor: string;
  accentColor: string;
  mutedColor: string;
  defaultOutputTemplateKey: RapidQuoteOutputTemplateKey;
  allowedOutputTemplateKeys: RapidQuoteOutputTemplateKey[];
  defaults: RapidQuoteCompanyDefaults;
  provider: RapidQuoteProviderDefaults;
};

export const OUTPUT_TEMPLATE_OPTIONS: Array<{
  key: RapidQuoteOutputTemplateKey;
  label: string;
  description: string;
}> = [
  {
    key: "inet_proposal",
    label: "Detailed proposal",
    description: "Current RapidQuote multi-section proposal layout with executive summary, pricing pages, and terms.",
  },
  {
    key: "estimate_compact",
    label: "Simple estimate",
    description: "Short estimate-style output with bill-to/ship-to, concise line items, totals, notes, and signature acceptance.",
  },
];

export const COMPANY_BRANDING: Record<RapidQuoteCompanyKey, RapidQuoteCompanyBranding> = {
  inet: {
    key: "inet",
    label: "iNet",
    legalName: "iNet Managed Technology Services",
    shortName: "iNet",
    appLabel: "RapidQuote by iNet",
    proposalBannerText: "iNet Communications Proposal",
    logoSrc: "/inet-logo.png",
    logoAlt: "iNet logo",
    primaryColor: "#ae0910",
    accentColor: "#f7eaea",
    mutedColor: "#6f7c89",
    defaultOutputTemplateKey: "inet_proposal",
    allowedOutputTemplateKeys: ["inet_proposal"],
    defaults: {
      documentTitle: "Budgetary Estimate",
      documentSubtitle: "Managed Communications Services",
      customerAddressHeading: "Customer Address",
      providerAddressHeading: "iNet Address",
      preparedByLabel: "Prepared By",
      providerHeading: "iNet",
      billToHeading: "Bill To",
      shipToHeading: "Ship To",
    },
    provider: {
      name: "iNet",
      contactName: "Nick Panyard",
      contactPhone: "919-864-5912",
      contactEmail: "nick.panyard@inetlte.com",
      addressLines: ["Galleria Tower 2", "5051 Westheimer Road, Suite 1700", "Houston, TX 77056"],
    },
  },
  ilios: {
    key: "ilios",
    label: "Ilios Integrators",
    legalName: "Ilios System Integrators LLC.",
    shortName: "Ilios",
    appLabel: "RapidQuote for Ilios Integrators",
    proposalBannerText: "Ilios Integrators Proposal",
    logoSrc: "/ilios-logo.svg",
    logoAlt: "Ilios Integrators logo",
    primaryColor: "#3388AA",
    accentColor: "#F1995D",
    mutedColor: "#5c7284",
    defaultOutputTemplateKey: "inet_proposal",
    allowedOutputTemplateKeys: ["estimate_compact", "inet_proposal"],
    defaults: {
      documentTitle: "Estimate",
      documentSubtitle: "Systems integration pricing",
      customerAddressHeading: "Customer Address",
      providerAddressHeading: "Estimate from",
      preparedByLabel: "Prepared By",
      providerHeading: "Ilios Integrators",
      billToHeading: "Bill to",
      shipToHeading: "Ship to",
      expirationDays: 30,
    },
    provider: {
      name: "Ilios System Integrators LLC.",
      contactName: "",
      contactPhone: "+1 (346) 249-1041",
      contactEmail: "bbataille@ilios-integrators.com",
      addressLines: ["5913 E Post Oak Ln", "Houston, TX 77055-5057", "https://ilios-integrators.com/"],
    },
  },
};

export function getCompanyBranding(key?: RapidQuoteCompanyKey | null) {
  return COMPANY_BRANDING[key ?? "inet"] ?? COMPANY_BRANDING.inet;
}

export function getOutputTemplateOption(key: RapidQuoteOutputTemplateKey) {
  return OUTPUT_TEMPLATE_OPTIONS.find((option) => option.key === key) ?? OUTPUT_TEMPLATE_OPTIONS[0];
}

import type { QuoteTermsPackageKey, QuoteTermsSection } from "@/app/lib/quote-record";

export type QuoteTermsPackageDefinition = {
  key: QuoteTermsPackageKey;
  label: string;
  description: string;
  terms: QuoteTermsSection;
};

export const TERMS_PACKAGES: QuoteTermsPackageDefinition[] = [
  {
    key: "starlink_only",
    label: "Starlink Only",
    description: "Use for Starlink-only service and hardware proposals.",
    terms: {
      selectedPackageKey: "starlink_only",
      generalStarlinkServiceTermsTitle: "General Starlink Service Terms",
      generalStarlinkServiceTerms: [
        "Local service is for land-based Starlink services.",
        "Prices may change with 30 days notice if SpaceX / Starlink pricing plans are modified.",
        "Pool plan kits must stay opted in when overage handling requires it.",
        "Automatic overage blocks do not permanently change the subscription plan.",
      ],
      pricingTermsTitle: "Starlink Pricing Terms and Conditions",
      pricingTerms: [
        "Pricing is based on the Starlink service structure shown in this proposal.",
        "This quote is valid for 30 days from the proposal creation date unless stated otherwise.",
        "Pricing excludes applicable taxes, tariffs, and civil works unless explicitly included.",
        "Payment terms are Net 30 unless otherwise stated in the governing agreement.",
      ],
    },
  },
  {
    key: "integration_only",
    label: "Integration Only",
    description: "Placeholder package for integration-only orders until final legal text is available.",
    terms: {
      selectedPackageKey: "integration_only",
      generalStarlinkServiceTermsTitle: "Integration Project Terms (Placeholder)",
      generalStarlinkServiceTerms: [
        "Integration-only legal terms are still being finalized and must be reviewed before customer release.",
        "Use this placeholder package to structure the proposal now, then replace with approved integration terms later.",
      ],
      pricingTermsTitle: "Integration Pricing Terms (Placeholder)",
      pricingTerms: [
        "Pricing shown is for integration scope only unless other service language is explicitly added.",
        "Commercial and legal integration terms must be replaced with approved final language before external delivery.",
      ],
    },
  },
  {
    key: "starlink_plus_integration",
    label: "Starlink + Integration",
    description: "Combined package for mixed Starlink and integration orders.",
    terms: {
      selectedPackageKey: "starlink_plus_integration",
      generalStarlinkServiceTermsTitle: "Combined Starlink and Integration Terms",
      generalStarlinkServiceTerms: [
        "Apply Starlink service terms to the managed connectivity scope included in this proposal.",
        "Apply integration project controls and delivery assumptions to installation, configuration, and project work.",
        "Where final integration legal language is not yet available, this package acts as a placeholder and must be reviewed before release.",
      ],
      pricingTermsTitle: "Combined Commercial Terms",
      pricingTerms: [
        "Recurring Starlink-related pricing and one-time integration pricing may be governed by different commercial assumptions inside the same proposal.",
        "This quote is valid for 30 days from the proposal creation date unless stated otherwise.",
        "Pricing excludes taxes, tariffs, and out-of-scope civil works unless explicitly included.",
        "Replace placeholder integration language with approved final terms before customer release when required.",
      ],
    },
  },
];

export function getTermsPackageDefinition(key: QuoteTermsPackageKey) {
  return TERMS_PACKAGES.find((entry) => entry.key === key) ?? TERMS_PACKAGES[0];
}

export function buildTermsFromPackage(key: QuoteTermsPackageKey): QuoteTermsSection {
  const definition = getTermsPackageDefinition(key);
  return {
    selectedPackageKey: definition.terms.selectedPackageKey,
    generalStarlinkServiceTermsTitle: definition.terms.generalStarlinkServiceTermsTitle,
    generalStarlinkServiceTerms: [...definition.terms.generalStarlinkServiceTerms],
    pricingTermsTitle: definition.terms.pricingTermsTitle,
    pricingTerms: [...definition.terms.pricingTerms],
  };
}

import type { QuoteWarrantyDetails } from "@/app/lib/quote-record";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function createDefaultQuoteWarrantyDetails(): QuoteWarrantyDetails {
  return {
    enabled: true,
    heading: "Manufacturer Warranty Reference",
    manufacturerReference: "Quoted hardware follows the applicable manufacturer warranty in effect at the time of shipment.",
    coverageNote: "Use this quote-level section to confirm any warranty coverage limits, registration requirements, or manufacturer-specific exceptions that should travel with the proposal.",
    claimNote: "iNet can help coordinate commercially reasonable warranty support, but onsite labor, expedited freight, and items outside manufacturer coverage stay excluded unless this proposal states otherwise.",
  };
}

export function normalizeQuoteWarrantyDetails(value: QuoteWarrantyDetails | null | undefined): QuoteWarrantyDetails {
  const defaults = createDefaultQuoteWarrantyDetails();

  return {
    enabled: value?.enabled ?? defaults.enabled,
    heading: normalizeText(value?.heading) || defaults.heading,
    manufacturerReference: normalizeText(value?.manufacturerReference) || defaults.manufacturerReference,
    coverageNote: normalizeText(value?.coverageNote) || defaults.coverageNote,
    claimNote: normalizeText(value?.claimNote) || defaults.claimNote,
  };
}

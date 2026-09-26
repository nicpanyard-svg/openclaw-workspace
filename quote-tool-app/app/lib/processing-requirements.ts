import { applyMajorProjectToQuote } from "./major-project";
import type { ProcessingRateKey, ProcessingRequirements, QuoteRecord } from "./quote-record";
import { getIncludedEquipmentRows } from "./proposal-commercial-summary";

export const PROCESSING_RATES: { key: ProcessingRateKey; label: string; basis: string }[] = [
  { key: "managementSupport", label: "Management and support fee", basis: "per month" },
  { key: "terminalAccess", label: "TAC (terminal access charge)", basis: "per terminal / month" },
  { key: "data50", label: "50GB", basis: "per month" },
  { key: "data500", label: "500GB", basis: "per month" },
  { key: "overages", label: "Overages", basis: "per GB" },
  { key: "poolTac", label: "Pool TAC", basis: "per terminal / month" },
];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function choice<T extends string>(value: unknown, values: readonly T[], fallback: T): T { return values.find(item => item === value) ?? fallback; }
export function normalizeProcessingRequirements(value: unknown): ProcessingRequirements {
  const raw = object(value), rates = object(raw.rates);
  return {
    starlinkService: choice(raw.starlinkService, ["fixed", "mini_vehicle"], "fixed"),
    pricingStructure: choice(raw.pricingStructure, ["pending", "individual", "pool"], "pending"),
    publicIp: choice(raw.publicIp, ["pending", "yes", "no"], "pending"),
    equipmentRequired: choice(raw.equipmentRequired, ["pending", "yes", "no"], "pending"),
    subAccountStatus: choice(raw.subAccountStatus, ["pending", "yes", "no"], "pending"),
    subAccount: text(raw.subAccount),
    corporatePricing: choice(raw.corporatePricing, ["pending", "yes", "no"], "pending"),
    corporatePricingReference: text(raw.corporatePricingReference),
    equipment: Object.fromEntries(Object.entries(object(raw.equipment)).map(([id, value]) => { const item = object(value); return [id, { kind: choice(item.kind, ["pending", "assembly", "standalone"], "pending"), assemblyDetails: text(item.assemblyDetails) }]; })),
    rates: Object.fromEntries(PROCESSING_RATES.map(({ key, basis }) => { const rate = object(rates[key]); return [key, {
      status: choice(rate.status, ["pending", "priced", "included", "not_applicable"], "pending"),
      amount: typeof rate.amount === "number" && Number.isFinite(rate.amount) && rate.amount >= 0 ? rate.amount : null,
      basis: rate.basis === undefined ? basis : text(rate.basis),
    }]; })) as ProcessingRequirements["rates"],
  };
}
export function missingProcessingRequirements(source: QuoteRecord): string[] {
  const quote = source.metadata.workflowMode === "major_project" && source.majorProject?.enabled ? applyMajorProjectToQuote(source) : source;
  const details = normalizeProcessingRequirements(quote.orderProcessing?.requirements);
  const missing: string[] = [];
  if (!text(quote.customer.name)) missing.push("Customer");
  if (details.subAccountStatus === "pending") missing.push("Sub-account decision");
  if (details.subAccountStatus === "yes" && !details.subAccount) missing.push("Sub-account name / ID");
  if (!text(quote.orderProcessing?.dataPlanDetails)) missing.push("Data plan / allocation details");
  if (details.corporatePricing === "pending") missing.push("Corporate pricing decision");
  const equipment = quote.sections.sectionB.enabled ? getIncludedEquipmentRows(quote) : [];
  if (!equipment.length && details.equipmentRequired === "pending") missing.push("Equipment needed decision");
  if (!equipment.length && details.equipmentRequired === "yes") missing.push("Equipment items, quantities and pricing");
  for (const row of equipment) {
    if (!details.equipment[row.id] || details.equipment[row.id].kind === "pending") missing.push(`${row.itemName}: assembly or standalone`);
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) missing.push(`${row.itemName}: equipment quantity`);
    if (![row.unitPrice, row.totalPrice].every(value => Number.isFinite(value) && value >= 0)) missing.push(`${row.itemName}: equipment pricing`);
  }
  if (details.corporatePricing === "no" && details.pricingStructure === "pending") missing.push("Individual or pool pricing decision");
  if (details.corporatePricing === "no") for (const { key, label } of requiredProcessingRates(details)) {
    const rate = details.rates[key];
    if (rate.status === "pending" || (rate.status === "priced" && (rate.amount === null || !rate.basis))) missing.push(`${label} pricing`);
  }
  if (!quote.orderProcessing?.overageOptIn || quote.orderProcessing.overageOptIn === "pending") missing.push("Overage opt-in decision");
  if (details.publicIp === "pending") missing.push("Public IP decision");
  const shipping = quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo;
  if (!quote.orderProcessing?.shippingRequired || quote.orderProcessing.shippingRequired === "pending") missing.push("Shipping decision");
  if (quote.orderProcessing?.shippingRequired === "yes") {
    if (!shipping.lines?.some(line => text(line))) missing.push("Shipping address");
    if (!text(shipping.attention)) missing.push("Shipping contact name");
    if (!text(quote.orderProcessing.shippingContactPhone)) missing.push("Shipping contact phone");
  }
  if (!quote.customer.addressLines?.some(line => text(line))) missing.push("Service address");
  if (!text(quote.customer.contactName)) missing.push("POC name");
  if (!text(quote.customer.contactPhone)) missing.push("POC phone number");
  if (!text(quote.orderProcessing?.notes)) missing.push("Special instructions (or None)");
  return missing;
}
export function requiredProcessingRates(details: ProcessingRequirements) {
  return PROCESSING_RATES.filter(({ key }) => details.pricingStructure === "pool" ? ["poolTac", "managementSupport"].includes(key) : details.pricingStructure === "individual" ? key !== "poolTac" : false);
}
export function formatProcessingRate(rate: ProcessingRequirements["rates"][ProcessingRateKey], currency = "USD") {
  if (rate.status === "included") return "Included";
  if (rate.status === "not_applicable") return "Not applicable";
  if (rate.status !== "priced" || rate.amount === null || !rate.basis) return "Not confirmed";
  return `${new Intl.NumberFormat("en-US", { style: "currency", currency }).format(rate.amount)} ${rate.basis}`;
}

// Starlink-only price sheet dated 2025-12-29. User confirmed the listed $27.50
// for 50GB and the same $42 terminal access charge for pooled service.
export function prefillStarlinkRates(details: ProcessingRequirements, reset = false): ProcessingRequirements {
  const amounts: Record<ProcessingRateKey, number> = { managementSupport: details.starlinkService === "mini_vehicle" ? 5 : 10, terminalAccess: 42, data50: 27.5, data500: 131.25, overages: 0.55, poolTac: 42 };
  return { ...details, rates: Object.fromEntries(PROCESSING_RATES.map(({ key, basis }) => [key, reset || details.rates[key].status === "pending" ? { status: "priced", amount: amounts[key], basis } : { ...details.rates[key] }])) as ProcessingRequirements["rates"] };
}

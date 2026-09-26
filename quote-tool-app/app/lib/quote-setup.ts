import { missingProcessingRequirements, PROCESSING_RATES } from "./processing-requirements";
import type { QuoteRecord } from "./quote-record";

export type QuoteSetupStepId = "contact" | "equipment" | "pricing" | "delivery" | "review";

export const QUOTE_SETUP_STEPS = [
  { id: "contact", title: "Contact & site", description: "Add the customer, service address, and point of contact." },
  { id: "equipment", title: "Equipment", description: "Choose the equipment, quantities, and prices, and identify any assemblies." },
  { id: "pricing", title: "Plan & rates", description: "Confirm the data plan and pricing. You can edit the prefilled rates." },
  { id: "delivery", title: "Delivery", description: "Confirm shipping, service preferences, and special instructions." },
  { id: "review", title: "Review", description: "Check the completed order details before creating the quote." },
] as const satisfies readonly { id: QuoteSetupStepId; title: string; description: string }[];

const contactRequirements = new Set([
  "Customer", "Sub-account decision", "Sub-account name / ID", "Service address", "POC name", "POC phone number",
]);
const pricingRequirements = new Set([
  "Data plan / allocation details", "Corporate pricing decision", "Individual or pool pricing decision",
  ...PROCESSING_RATES.map(({ label }) => `${label} pricing`),
]);
const deliveryRequirements = new Set([
  "Overage opt-in decision", "Public IP decision", "Shipping decision", "Shipping address", "Shipping contact name",
  "Shipping contact phone", "Special instructions (or None)",
]);

function requirementStep(requirement: string): Exclude<QuoteSetupStepId, "review"> {
  if (contactRequirements.has(requirement)) return "contact";
  if (pricingRequirements.has(requirement)) return "pricing";
  if (deliveryRequirements.has(requirement)) return "delivery";
  return "equipment";
}

export function getQuoteSetupSteps(quote: QuoteRecord): { id: QuoteSetupStepId; title: string; description: string; missing: string[] }[] {
  // Keep one canonical validator for intake, save, and export, including Major Project output rows.
  const missing = missingProcessingRequirements(quote);
  return QUOTE_SETUP_STEPS.map(step => ({
    ...step,
    missing: step.id === "review" ? missing : missing.filter(requirement => requirementStep(requirement) === step.id),
  }));
}

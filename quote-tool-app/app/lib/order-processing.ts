import {
  getCombinedOneTimeTotal,
  getCustomerFacingEquipmentTotal,
  getEquipmentTotal,
  getIncludedEquipmentRows,
  getIncludedSectionARows,
  getIncludedServiceRows,
  getLeaseMonthlyTotal,
  getOptionalServicesTotal,
  getProposalOptionCostSummary,
  getRecurringMonthlyTotal,
} from "./proposal-commercial-summary";
import type {
  EquipmentPricingRow,
  QuoteOrderProcessing,
  QuoteRecord,
  ServicePricingRow,
} from "./quote-record";

export type OrderProcessingSubscriptionRow = {
  id: string;
  description: string;
  kind: "Data plan" | "Monitoring & support" | "Terminal access fee" | "Overage" | "Other";
  quantity: number | null;
  unitPrice: number;
  total: number;
  billingLabel: string;
};

export type OrderProcessingSummary = {
  details: QuoteOrderProcessing;
  serviceAddress: string[];
  shippingAddress: string[];
  shippingContactName: string;
  subscriptionRows: OrderProcessingSubscriptionRow[];
  equipmentRows: EquipmentPricingRow[];
  serviceRows: ServicePricingRow[];
  missingFields: string[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function lines(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function decision<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  const normalized = text(value);
  return choices.find((choice) => choice === normalized) ?? fallback;
}

export function normalizeOrderProcessing(value: unknown): QuoteOrderProcessing {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    terminals: lines(raw.terminals),
    terminalsStatus: decision(raw.terminalsStatus, ["pending", "listed", "not_applicable"] as const, "pending"),
    shippingRequired: decision(raw.shippingRequired, ["pending", "yes", "no"] as const, "pending"),
    shippingContactPhone: text(raw.shippingContactPhone),
    overageOptIn: decision(raw.overageOptIn, ["pending", "yes", "no", "not_applicable"] as const, "pending"),
    dataPlanDetails: text(raw.dataPlanDetails),
    monitoringSupportDetails: text(raw.monitoringSupportDetails),
    terminalAccessFeeDetails: text(raw.terminalAccessFeeDetails),
    miscellaneousChargesNotes: text(raw.miscellaneousChargesNotes),
    notes: text(raw.notes),
  };
}

export function getOrderProcessing(quote: QuoteRecord): QuoteOrderProcessing {
  return normalizeOrderProcessing(quote.orderProcessing);
}

function subscriptionKind(rowType: string): OrderProcessingSubscriptionRow["kind"] {
  switch (rowType) {
    case "service": return "Data plan";
    case "support": return "Monitoring & support";
    case "terminal_fee": return "Terminal access fee";
    case "overage": return "Overage";
    default: return "Other";
  }
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getOrderProcessingSummary(quote: QuoteRecord): OrderProcessingSummary {
  const details = getOrderProcessing(quote);
  const shipping = quote.shippingSameAsBillTo ? quote.billTo : quote.shipTo;
  const serviceAddress = lines(quote.customer.addressLines);
  const shippingAddress = lines(shipping.lines);
  const shippingContactName = text(shipping.attention);
  const subscriptionRows: OrderProcessingSubscriptionRow[] = (quote.sections.sectionA.enabled
    ? getIncludedSectionARows(quote)
    : []).map((row) => {
      const kind = subscriptionKind(row.rowType);
      const annotation = kind === "Data plan" ? details.dataPlanDetails
        : kind === "Monitoring & support" ? details.monitoringSupportDetails
        : kind === "Terminal access fee" ? details.terminalAccessFeeDetails : "";
      // Major Project includedText can contain generated internal cost details.
      const description = text(row.description);
      const unit = text(row.unitLabel);
      return {
        id: row.id,
        description: description || annotation || kind,
        kind,
        quantity: typeof row.quantity === "number" && Number.isFinite(row.quantity) ? row.quantity : null,
        unitPrice: finiteNumber(row.monthlyRate ?? row.unitPrice),
        total: finiteNumber(row.totalMonthlyRate),
        billingLabel: kind === "Overage" ? `Usage-based per ${unit || "unit"}` : `Monthly${unit ? ` per ${unit}` : ""}`,
      };
    });
  const equipmentRows = quote.sections.sectionB.enabled ? getIncludedEquipmentRows(quote) : [];
  const serviceRows = quote.sections.sectionC.enabled ? getIncludedServiceRows(quote) : [];
  const missingFields: string[] = [];
  if (!serviceAddress.length) missingFields.push("Service address");
  if (details.terminalsStatus === "pending") missingFields.push("Terminal decision");
  if (details.terminalsStatus === "listed" && !details.terminals.length) missingFields.push("Terminal identifiers / names");
  if (details.shippingRequired === "pending") missingFields.push("Shipping decision");
  if (details.shippingRequired === "yes") {
    if (!shippingAddress.length) missingFields.push("Shipping address");
    if (!shippingContactName) missingFields.push("Shipping contact name");
    if (!details.shippingContactPhone) missingFields.push("Shipping contact phone");
  }
  if (subscriptionRows.length) {
    if (!details.dataPlanDetails) missingFields.push("Data plan / allocation details");
    if (details.overageOptIn === "pending") missingFields.push("Overage opt-in decision");
    if (!subscriptionRows.some((row) => row.kind === "Monitoring & support") && !details.monitoringSupportDetails) {
      missingFields.push("Monitoring / support fee definition");
    }
    if (!subscriptionRows.some((row) => row.kind === "Terminal access fee") && !details.terminalAccessFeeDetails) {
      missingFields.push("Terminal access fee definition");
    }
  }
  if (details.overageOptIn === "yes" && !subscriptionRows.some((row) => row.kind === "Overage")) {
    missingFields.push("Overage pricing");
  }
  if (quote.metadata.quoteType === "lease" && !quote.metadata.hasActiveDataAgreement) {
    missingFields.push("Active data agreement confirmation");
  }
  return { details, serviceAddress, shippingAddress, shippingContactName, subscriptionRows, equipmentRows, serviceRows, missingFields };
}

export function buildOrderProcessingText(quote: QuoteRecord): string {
  const summary = getOrderProcessingSummary(quote);
  const { details, subscriptionRows, equipmentRows, serviceRows } = summary;
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency", currency: quote.metadata.currencyCode || "USD",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const money = (value: number) => currency.format(value);
  const provided = (value: string | undefined) => text(value) || "Not provided";
  const stateLabel = (value: string) => value === "not_applicable" ? "Not applicable"
    : value.charAt(0).toUpperCase() + value.slice(1);
  const feeDefinition = (kind: OrderProcessingSubscriptionRow["kind"], annotation: string) =>
    subscriptionRows.filter((row) => row.kind === kind).map((row) => row.description).join("; ") || provided(annotation);

  // The shared total helpers do not gate disabled sections themselves.
  const recurringTotal = quote.sections.sectionA.enabled ? getRecurringMonthlyTotal(quote) : 0;
  const equipmentTotal = quote.sections.sectionB.enabled ? getEquipmentTotal(quote) : 0;
  const servicesTotal = quote.sections.sectionC.enabled ? getOptionalServicesTotal(quote) : 0;
  const isLease = quote.metadata.quoteType === "lease";
  const leaseMonthly = quote.sections.sectionB.enabled ? getLeaseMonthlyTotal(quote, recurringTotal, equipmentTotal) : recurringTotal;
  const options = getProposalOptionCostSummary(quote);
  const output = [
    ...(summary.missingFields.length ? [`DRAFT - missing details (${summary.missingFields.length})`, `Missing details: ${summary.missingFields.join("; ")}`, ""] : []),
    "Internal order-processing handoff",
    `Quote: ${provided(quote.metadata.proposalNumber)}`,
    `Quote ID: ${provided(quote.internal.quoteId)}`,
    `Saved proposal ID: ${provided(quote.internal.savedProposalId)}`,
    `Revision: ${provided(quote.metadata.revisionVersion)}`,
    `Quote date: ${provided(quote.metadata.proposalDate)}`,
    `Customer: ${provided(quote.customer.name)}`,
    `Customer account ID: ${provided(quote.metadata.accountId)}`,
    `Saved customer ID: ${provided(quote.internal.savedCustomerProfileId)}`,
    `Customer contact: ${provided(quote.customer.contactName)}`,
    `Customer phone: ${provided(quote.customer.contactPhone)}`,
    `Customer email: ${provided(quote.customer.contactEmail)}`,
    `Quote type: ${isLease ? "Lease" : "Purchase"}`,
    ...(isLease ? [`Lease data agreement: ${quote.metadata.hasActiveDataAgreement ? "Confirmed" : "Pending (not confirmed)"}`] : []),
    `Currency: ${quote.metadata.currencyCode || "USD"}`,
    `Term: ${isLease ? quote.metadata.leaseTermMonths ?? 12 : quote.sections.sectionA.termMonths} months`,
    "",
    "Service address:",
    ...(summary.serviceAddress.length ? summary.serviceAddress : ["Not provided"]),
    `Terminal decision: ${stateLabel(details.terminalsStatus)}`,
    `Terminal identifiers / names: ${details.terminals.join("; ") || "Not provided"}`,
    "",
    `Shipping required: ${stateLabel(details.shippingRequired)}`,
    `Shipping address source: ${quote.shippingSameAsBillTo ? "Bill to" : "Ship to"}`,
    "Shipping address (recorded):",
    ...(summary.shippingAddress.length ? summary.shippingAddress : ["Not provided"]),
    `Shipping contact: ${provided(summary.shippingContactName)}`,
    `Shipping phone: ${provided(details.shippingContactPhone)}`,
    "",
    `Subscription mode: ${quote.sections.sectionA.mode === "pool" ? "Pool" : "Per kit"}`,
    `Data plan details (explicit annotation): ${provided(details.dataPlanDetails)}`,
    `Monitoring & support definition: ${feeDefinition("Monitoring & support", details.monitoringSupportDetails)}`,
    `Monitoring & support annotation: ${provided(details.monitoringSupportDetails)}`,
    `Terminal access fee definition: ${feeDefinition("Terminal access fee", details.terminalAccessFeeDetails)}`,
    `Terminal access fee annotation: ${provided(details.terminalAccessFeeDetails)}`,
    `Overage opt-in: ${stateLabel(details.overageOptIn)}${details.overageOptIn === "pending" ? " (not authorized)" : ""}`,
    "Included subscription lines:",
    ...subscriptionRows.map((row) =>
      `- [${row.id}] ${row.kind}: ${row.description} | Qty: ${row.quantity ?? "Not specified"} | Rate: ${money(row.unitPrice)} (${row.billingLabel}) | Quoted line total: ${money(row.total)}`),
    ...(!subscriptionRows.length ? ["None"] : []),
    `Quoted recurring total: ${money(recurringTotal)}/month`,
    ...(isLease ? [`Lease monthly total: ${money(leaseMonthly)}/month`] : []),
    "",
    isLease ? "Included equipment (pricing basis, not an upfront purchase):" : "Included equipment (one-time purchase):",
    ...equipmentRows.map((row) =>
      `- [${row.id}] ${row.itemName} | Qty: ${row.quantity} | Unit price: ${money(row.unitPrice)} | ${isLease ? "Pricing basis" : "Line total"}: ${money(row.totalPrice)}${text(row.description) ? ` | ${text(row.description)}` : ""}`),
    ...(!equipmentRows.length ? ["None"] : []),
    `${isLease ? "Equipment pricing basis total" : "Equipment total"}: ${money(equipmentTotal)}`,
    `Customer upfront equipment: ${money(getCustomerFacingEquipmentTotal(quote, equipmentTotal))}`,
    "",
    "Included field services / miscellaneous charges (one-time):",
    ...serviceRows.map((row) =>
      `- [${row.id}] ${row.description} | Qty: ${row.quantity}${text(row.unitLabel) ? ` ${text(row.unitLabel)}` : ""} | Unit price: ${money(row.unitPrice)} | Line total: ${money(row.totalPrice)}${text(row.notes) ? ` | Notes: ${text(row.notes)}` : ""}`),
    ...(!serviceRows.length ? ["None"] : []),
    `Field / miscellaneous charges total: ${money(servicesTotal)}`,
    `Miscellaneous charges notes: ${provided(details.miscellaneousChargesNotes)}`,
    `Customer one-time total: ${money(getCombinedOneTimeTotal(quote, equipmentTotal, servicesTotal))}`,
    "",
    "Optional items (excluded from order totals; require separate selection):",
    ...options.items.map((item) => `- [${item.key}] ${item.label}: ${money(item.amount)} (${item.cadence === "monthly" ? "monthly" : "one-time"})`),
    ...(!options.items.length ? ["None"] : []),
    `Excluded optional monthly total: ${money(options.monthlyTotal)}`,
    `Excluded optional one-time total: ${money(options.oneTimeTotal)}`,
    "",
    `Order notes: ${provided(details.notes)}`,
    `Missing fields: ${summary.missingFields.join("; ") || "None"}`,
  ];
  return output.join("\n");
}

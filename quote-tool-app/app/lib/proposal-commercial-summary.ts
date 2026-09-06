import type { EquipmentPricingRow, LeaseTermMonths, PerKitPricingRow, PoolPricingRow, QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";
import { hasExecutiveSummaryStructuredContent } from "@/app/lib/executive-summary";

export type CommercialSummaryItemTone = "default" | "accent";
export type OptionCostCadence = "monthly" | "one_time";

export type ProposalCommercialSummaryItem = {
  key: string;
  label: string;
  value: number;
  tone?: CommercialSummaryItemTone;
};

export type ProposalOptionCostItem = {
  key: string;
  label: string;
  description?: string;
  sourceSection: "sectionA" | "sectionB" | "sectionC";
  categoryLabel: string;
  cadence: OptionCostCadence;
  quantity?: number | null;
  unitLabel?: string | null;
  amount: number;
};

export type ProposalOptionCostSummary = {
  items: ProposalOptionCostItem[];
  monthlyTotal: number;
  oneTimeTotal: number;
};

function getSectionARows(sectionA: QuoteRecord["sections"]["sectionA"]) {
  return sectionA.mode === "pool" ? sectionA.poolRows : sectionA.perKitRows;
}

export function isOptionalLineItem(row?: { optional?: boolean } | null) {
  return row?.optional === true;
}

function getIncludedRows<T extends { optional?: boolean }>(rows: T[]) {
  return rows.filter((row) => !isOptionalLineItem(row));
}

export function getIncludedSectionARows(quote: QuoteRecord) {
  return getIncludedRows(getSectionARows(quote.sections.sectionA));
}

export function getIncludedEquipmentRows(quote: QuoteRecord) {
  return getIncludedRows(quote.sections.sectionB.lineItems);
}

export function getIncludedServiceRows(quote: QuoteRecord) {
  return getIncludedRows(quote.sections.sectionC.lineItems);
}

export function hasSectionARows(rows: Array<PoolPricingRow | PerKitPricingRow>) {
  return rows.some((row) => {
    if (row.rowType === "support") {
      return Boolean(row.description?.trim() || row.includedText?.some((item) => item.trim().length > 0));
    }

    return Boolean((row.description?.trim().length ?? 0) > 0) && ((row.totalMonthlyRate ?? row.monthlyRate ?? row.unitPrice ?? 0) > 0 || (row.quantity ?? 0) > 0);
  });
}

export function hasEquipmentRows(rows: EquipmentPricingRow[]) {
  return rows.some((row) => Boolean(row.itemName?.trim().length) && ((row.totalPrice ?? 0) > 0 || row.quantity > 0));
}

export function hasServiceRows(rows: ServicePricingRow[]) {
  return rows.some((row) => Boolean(row.description?.trim().length) && ((row.totalPrice ?? 0) > 0 || row.quantity > 0));
}

export function hasExecutiveSummaryContent(quote: QuoteRecord) {
  return hasExecutiveSummaryStructuredContent(quote.executiveSummary);
}

export function hasCustomerVisibleCustomFieldData(quote: QuoteRecord) {
  return (quote.customFields ?? []).some(
    (field) => field.visibility === "customer" && field.label.trim().length > 0 && field.value.trim().length > 0,
  );
}

export function getQuoteContentPresence(quote: QuoteRecord) {
  const sectionARows = getSectionARows(quote.sections.sectionA);
  const hasSectionAContent = hasSectionARows(getIncludedRows(sectionARows));
  const hasSectionBContent = hasEquipmentRows(getIncludedRows(quote.sections.sectionB.lineItems));
  const hasSectionCContent = hasServiceRows(getIncludedRows(quote.sections.sectionC.lineItems));

  return {
    hasSectionAContent,
    hasSectionBContent,
    hasSectionCContent,
    hasOptionCostsContent: getProposalOptionCostSummary(quote).items.length > 0,
    hasExecutiveSummaryContent: hasExecutiveSummaryContent(quote),
    hasCustomerVisibleCustomFieldData: hasCustomerVisibleCustomFieldData(quote),
  };
}

export function getRecurringMonthlyTotal(quote: QuoteRecord) {
  return Number(
    getSectionARows(quote.sections.sectionA)
      .filter((row) => !isOptionalLineItem(row))
      .reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0)
      .toFixed(2),
  );
}

export function getEquipmentTotal(quote: QuoteRecord) {
  return Number(
    quote.sections.sectionB.lineItems
      .filter((row) => !isOptionalLineItem(row))
      .reduce((sum, row) => sum + (row.totalPrice ?? 0), 0)
      .toFixed(2),
  );
}

export function getOptionalServicesTotal(quote: QuoteRecord) {
  return Number(
    quote.sections.sectionC.lineItems
      .filter((row) => !isOptionalLineItem(row))
      .reduce((sum, row) => sum + (row.totalPrice ?? 0), 0)
      .toFixed(2),
  );
}

export function getProposalOptionCostSummary(quote: QuoteRecord): ProposalOptionCostSummary {
  const sectionARows = quote.sections.sectionA.enabled ? getSectionARows(quote.sections.sectionA) : [];
  const monthlyItems: ProposalOptionCostItem[] = sectionARows
    .filter((row) => isOptionalLineItem(row))
    .map((row) => ({
      key: `section-a-${row.id}`,
      label: row.description,
      sourceSection: "sectionA" as const,
      categoryLabel: "Monthly recurring",
      cadence: "monthly" as const,
      quantity: row.quantity,
      unitLabel: row.unitLabel,
      amount: Number((row.totalMonthlyRate ?? row.monthlyRate ?? row.unitPrice ?? 0).toFixed(2)),
    }))
    .filter((item) => item.label.trim().length > 0 && item.amount > 0);

  const equipmentItems: ProposalOptionCostItem[] = (quote.sections.sectionB.enabled ? quote.sections.sectionB.lineItems : [])
    .filter((row) => isOptionalLineItem(row))
    .map((row) => {
      const totalPrice = Number((row.totalPrice ?? 0).toFixed(2));
      const isLeasedHardware = quote.metadata.quoteType === "lease";
      const termMonths = quote.metadata.leaseTermMonths ?? 12;
      const amount = isLeasedHardware
        ? Number((applyMarginToCost(totalPrice, quote.metadata.leaseMarginPercent ?? 35) / termMonths).toFixed(2))
        : totalPrice;

      return {
        key: `section-b-${row.id}`,
        label: row.itemName,
        description: row.description,
        sourceSection: "sectionB" as const,
        categoryLabel: isLeasedHardware ? "Optional leased equipment" : "One-time equipment",
        cadence: isLeasedHardware ? "monthly" as const : "one_time" as const,
        quantity: row.quantity,
        unitLabel: "ea",
        amount,
      };
    })
    .filter((item) => item.label.trim().length > 0 && item.amount > 0);

  const serviceItems: ProposalOptionCostItem[] = (quote.sections.sectionC.enabled ? quote.sections.sectionC.lineItems : [])
    .filter((row) => isOptionalLineItem(row))
    .map((row) => ({
      key: `section-c-${row.id}`,
      label: row.description,
      description: row.notes,
      sourceSection: "sectionC" as const,
      categoryLabel: "Field services",
      cadence: "one_time" as const,
      quantity: row.quantity,
      unitLabel: row.unitLabel,
      amount: Number((row.totalPrice ?? 0).toFixed(2)),
    }))
    .filter((item) => item.label.trim().length > 0 && item.amount > 0);

  const items = [...monthlyItems, ...equipmentItems, ...serviceItems];
  const monthlyTotal = Number(items.filter((item) => item.cadence === "monthly").reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const oneTimeTotal = Number(items.filter((item) => item.cadence === "one_time").reduce((sum, item) => sum + item.amount, 0).toFixed(2));

  return {
    items,
    monthlyTotal,
    oneTimeTotal,
  };
}

export function isLeaseQuote(quote: QuoteRecord) {
  return quote.metadata.quoteType === "lease";
}

export function getCustomerFacingEquipmentTotal(quote: QuoteRecord, equipmentTotal?: number) {
  const equipment = equipmentTotal ?? getEquipmentTotal(quote);
  return isLeaseQuote(quote) ? 0 : equipment;
}

export function getCustomerFacingOneTimeTotal(
  quote: QuoteRecord,
  equipmentTotal?: number,
  optionalServicesTotal?: number,
) {
  const equipment = getCustomerFacingEquipmentTotal(quote, equipmentTotal);
  const services = optionalServicesTotal ?? getOptionalServicesTotal(quote);
  return Number((equipment + services).toFixed(2));
}

export function getCombinedOneTimeTotal(
  quote: QuoteRecord,
  equipmentTotal?: number,
  optionalServicesTotal?: number,
) {
  return getCustomerFacingOneTimeTotal(quote, equipmentTotal, optionalServicesTotal);
}

function applyMarginToCost(cost: number, marginPercent: number) {
  const safeCost = Number.isFinite(cost) ? Math.max(cost, 0) : 0;
  const safeMargin = Number.isFinite(marginPercent) ? Math.min(Math.max(marginPercent, 0), 95) : 0;
  if (safeCost <= 0) return 0;
  if (safeMargin <= 0) return Number(safeCost.toFixed(2));
  return Number((safeCost / (1 - safeMargin / 100)).toFixed(2));
}

function getLeaseHardwareCost(quote: QuoteRecord, equipmentTotal: number) {
  const capturedEquipmentCost = quote.commercial?.costs?.oneTimeEquipmentCost ?? 0;
  return Number((capturedEquipmentCost > 0 ? capturedEquipmentCost : equipmentTotal).toFixed(2));
}

export type LeasePricingSummary = {
  isLease: boolean;
  hasActiveDataAgreement: boolean;
  termMonths: LeaseTermMonths;
  marginPercent: number;
  recurringMonthlyTotal: number;
  hardwareCost: number;
  requiredHardwareRevenue: number;
  hardwareGrossProfit: number;
  hardwareMonthly: number;
  leaseMonthly: number;
};

export function getLeasePricingSummary(
  quote: QuoteRecord,
  recurringMonthlyTotal?: number,
  equipmentTotal?: number,
): LeasePricingSummary {
  const recurring = recurringMonthlyTotal ?? getRecurringMonthlyTotal(quote);
  const equipment = equipmentTotal ?? getEquipmentTotal(quote);
  const marginPercent = quote.metadata.leaseMarginPercent ?? 35;
  const term = quote.metadata.leaseTermMonths ?? 12;
  const leaseHardwareCost = getLeaseHardwareCost(quote, equipment);
  const requiredHardwareRevenue = applyMarginToCost(leaseHardwareCost, marginPercent);
  const hardwareMonthly = Number((requiredHardwareRevenue / term).toFixed(2));

  return {
    isLease: quote.metadata.quoteType === "lease",
    hasActiveDataAgreement: quote.metadata.hasActiveDataAgreement ?? false,
    termMonths: term,
    marginPercent,
    recurringMonthlyTotal: recurring,
    hardwareCost: leaseHardwareCost,
    requiredHardwareRevenue,
    hardwareGrossProfit: Number((requiredHardwareRevenue - leaseHardwareCost).toFixed(2)),
    hardwareMonthly,
    leaseMonthly: Number((recurring + hardwareMonthly).toFixed(2)),
  };
}

export function getLeaseMonthlyTotal(quote: QuoteRecord, recurringMonthlyTotal?: number, equipmentTotal?: number) {
  if (quote.metadata.quoteType !== "lease") return 0;

  return getLeasePricingSummary(quote, recurringMonthlyTotal, equipmentTotal).leaseMonthly;
}

export function buildProposalCommercialSummary(quote: QuoteRecord): ProposalCommercialSummaryItem[] {
  const recurringMonthlyTotal = getRecurringMonthlyTotal(quote);
  const equipmentTotal = getEquipmentTotal(quote);
  const optionalServicesTotal = getOptionalServicesTotal(quote);
  const isLease = isLeaseQuote(quote);
  const combinedOneTimeTotal = getCombinedOneTimeTotal(quote, equipmentTotal, optionalServicesTotal);
  const leaseMonthlyTotal = isLease
    ? getLeasePricingSummary(quote, recurringMonthlyTotal, equipmentTotal).leaseMonthly
    : getLeaseMonthlyTotal(quote, recurringMonthlyTotal, equipmentTotal);
  const presence = getQuoteContentPresence(quote);

  const items: ProposalCommercialSummaryItem[] = [];

  if (presence.hasSectionAContent && recurringMonthlyTotal > 0 && !isLease) {
    items.push({
      key: "recurring-monthly",
      label: "Monthly recurring",
      value: recurringMonthlyTotal,
    });
  }

  if (presence.hasSectionBContent && !isLease) {
    items.push({
      key: "one-time-equipment",
      label: "One-time equipment",
      value: equipmentTotal,
    });
  }

  if (presence.hasSectionCContent) {
    items.push({
      key: "field-services",
      label: "Field services",
      value: optionalServicesTotal,
    });

    items.push({
      key: "one-time-total",
      label: "One-time total",
      value: combinedOneTimeTotal,
    });
  }

  if (isLease) {
    items.push({
      key: "monthly-total",
      label: "Monthly total",
      value: leaseMonthlyTotal,
      tone: "accent",
    });
  }

  return items;
}

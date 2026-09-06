import type { EquipmentPricingRow, LeaseTermMonths, PerKitPricingRow, PoolPricingRow, QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";
import { hasExecutiveSummaryStructuredContent } from "@/app/lib/executive-summary";
import { getAnnualSubscriptionItems, getAnnualSubscriptionSummary, isAnnualLine } from "./quote-line-billing";

export type CommercialSummaryItemTone = "default" | "accent";
export type OptionCostCadence = "monthly" | "one_time" | "annual";

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
  unitPrice?: number;
  usageBased?: boolean;
  startsYear?: 1 | 2;
  amount: number;
};

export type ProposalOptionCostSummary = {
  items: ProposalOptionCostItem[];
  monthlyTotal: number;
  oneTimeTotal: number;
  annualTotal: number;
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
  return quote.sections.sectionA.enabled ? getIncludedRows(getSectionARows(quote.sections.sectionA)).filter((row) => row.rowType === "overage" || !isAnnualLine(row)) : [];
}

export function getIncludedEquipmentRows(quote: QuoteRecord) {
  return quote.sections.sectionB.enabled ? getIncludedRows(quote.sections.sectionB.lineItems).filter((row) => !isAnnualLine(row)) : [];
}

export function getIncludedServiceRows(quote: QuoteRecord) {
  return quote.sections.sectionC.enabled ? getIncludedRows(quote.sections.sectionC.lineItems).filter((row) => !isAnnualLine(row)) : [];
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
  const hasSectionAContent = hasSectionARows(getIncludedSectionARows(quote));
  const hasSectionBContent = hasEquipmentRows(getIncludedEquipmentRows(quote));
  const hasSectionCContent = hasServiceRows(getIncludedServiceRows(quote));

  return {
    hasSectionAContent,
    hasSectionBContent,
    hasSectionCContent,
    hasAnnualContent: getAnnualSubscriptionSummary(quote).items.length > 0,
    hasOptionCostsContent: getProposalOptionCostSummary(quote).items.length > 0,
    hasExecutiveSummaryContent: hasExecutiveSummaryContent(quote),
    hasCustomerVisibleCustomFieldData: hasCustomerVisibleCustomFieldData(quote),
  };
}

export function getRecurringMonthlyTotal(quote: QuoteRecord) {
  return Number(
    getIncludedSectionARows(quote)
      .reduce((sum, row) => sum + (row.rowType === "overage" ? 0 : row.totalMonthlyRate ?? 0), 0)
      .toFixed(2),
  );
}

export function getEquipmentTotal(quote: QuoteRecord) {
  return Number(
    getIncludedEquipmentRows(quote)
      .reduce((sum, row) => sum + (row.totalPrice ?? 0), 0)
      .toFixed(2),
  );
}

export function getOptionalServicesTotal(quote: QuoteRecord) {
  return Number(
    getIncludedServiceRows(quote)
      .reduce((sum, row) => sum + (row.totalPrice ?? 0), 0)
      .toFixed(2),
  );
}

export function getProposalOptionCostSummary(quote: QuoteRecord): ProposalOptionCostSummary {
  const sectionARows = quote.sections.sectionA.enabled ? getSectionARows(quote.sections.sectionA) : [];
  const monthlyItems: ProposalOptionCostItem[] = sectionARows
    .filter((row) => isOptionalLineItem(row) && (row.rowType === "overage" || !isAnnualLine(row)))
    .map((row) => ({
      key: `section-a-${row.id}`,
      label: row.description,
      sourceSection: "sectionA" as const,
      categoryLabel: "Monthly recurring",
      cadence: "monthly" as const,
      usageBased: row.rowType === "overage",
      quantity: row.quantity,
      unitLabel: row.unitLabel,
      amount: Number((row.rowType === "overage" ? row.monthlyRate ?? row.unitPrice ?? 0 : row.totalMonthlyRate ?? row.monthlyRate ?? row.unitPrice ?? 0).toFixed(2)),
    }))
    .filter((item) => item.label.trim().length > 0 && Number.isFinite(item.amount));

  const equipmentItems: ProposalOptionCostItem[] = (quote.sections.sectionB.enabled ? quote.sections.sectionB.lineItems : [])
    .filter((row) => isOptionalLineItem(row) && !isAnnualLine(row))
    .map((row) => {
      const totalPrice = Number((row.totalPrice ?? 0).toFixed(2));
      const isLeasedHardware = quote.metadata.quoteType === "lease";
      const termMonths = quote.metadata.leaseTermMonths ?? 12;
      const amount = isLeasedHardware
        ? Math.sign(totalPrice) * Number((applyMarginToCost(Math.abs(totalPrice), quote.metadata.leaseMarginPercent ?? 35) / termMonths).toFixed(2))
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
    .filter((item) => item.label.trim().length > 0 && Number.isFinite(item.amount));

  const serviceItems: ProposalOptionCostItem[] = (quote.sections.sectionC.enabled ? quote.sections.sectionC.lineItems : [])
    .filter((row) => isOptionalLineItem(row) && !isAnnualLine(row))
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
    .filter((item) => item.label.trim().length > 0 && Number.isFinite(item.amount));

  const annualItems: ProposalOptionCostItem[] = getAnnualSubscriptionItems(quote).filter((item) => item.optional).map((item) => ({
    key: item.key, label: item.label, description: item.description, sourceSection: item.sourceSection,
    cadence: "annual", categoryLabel: item.startsYear === 2 ? "Annual renewal option" : "Annual subscription option",
    quantity: item.quantity, unitLabel: item.unitLabel, amount: item.annualAmount, startsYear: item.startsYear,
  }));
  const items = [...monthlyItems, ...equipmentItems, ...serviceItems, ...annualItems].map((item) => ({
    ...item,
    unitPrice: "usageBased" in item && item.usageBased ? item.amount : getOptionUnitPrice(item.amount, item.quantity),
  }));
  const monthlyTotal = Number(items.filter((item) => item.cadence === "monthly" && !("usageBased" in item && item.usageBased)).reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const oneTimeTotal = Number(items.filter((item) => item.cadence === "one_time").reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const annualTotal = Number(items.filter((item) => item.cadence === "annual").reduce((sum, item) => sum + item.amount, 0).toFixed(2));

  return {
    items,
    monthlyTotal,
    oneTimeTotal,
    annualTotal,
  };
}

function getOptionUnitPrice(amount: number, quantity?: number | null) {
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount)) return undefined;

  // Retain fractional cents for display; the existing extended amount remains authoritative.
  const unitPrice = amount / quantity;
  return Number.isFinite(unitPrice) ? Number(unitPrice.toFixed(4)) : undefined;
}

export function isLeaseQuote(quote: QuoteRecord) {
  return quote.metadata.quoteType === "lease";
}

export function getQuotedSalesTax(quote: QuoteRecord) {
  const tax = quote.metadata.salesTaxAmount;
  return typeof tax === "number" && Number.isFinite(tax) && tax >= 0 ? Number(tax.toFixed(2)) : 0;
}

export function getCustomerFacingEquipmentTotal(quote: QuoteRecord, equipmentTotal?: number) {
  if (!quote.sections.sectionB.enabled) return 0;
  const equipment = equipmentTotal ?? getEquipmentTotal(quote);
  return isLeaseQuote(quote) ? 0 : equipment;
}

export function getCustomerFacingOneTimeTotal(
  quote: QuoteRecord,
  equipmentTotal?: number,
  optionalServicesTotal?: number,
) {
  const equipment = getCustomerFacingEquipmentTotal(quote, equipmentTotal);
  const services = quote.sections.sectionC.enabled ? optionalServicesTotal ?? getOptionalServicesTotal(quote) : 0;
  return Number((equipment + services + getQuotedSalesTax(quote)).toFixed(2));
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
  if (getIncludedEquipmentRows(quote).length === 0) return 0;
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
  const recurring = quote.sections.sectionA.enabled ? recurringMonthlyTotal ?? getRecurringMonthlyTotal(quote) : 0;
  const equipment = quote.sections.sectionB.enabled ? equipmentTotal ?? getEquipmentTotal(quote) : 0;
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
  const annual = getAnnualSubscriptionSummary(quote);
  const recurringMonthlyTotal = getRecurringMonthlyTotal(quote);
  const equipmentTotal = getEquipmentTotal(quote);
  const optionalServicesTotal = getOptionalServicesTotal(quote);
  const quotedSalesTax = getQuotedSalesTax(quote);
  const isLease = isLeaseQuote(quote);
  const combinedOneTimeTotal = getCombinedOneTimeTotal(quote, equipmentTotal, optionalServicesTotal);
  const leaseMonthlyTotal = isLease
    ? getLeasePricingSummary(quote, recurringMonthlyTotal, equipmentTotal).leaseMonthly
    : getLeaseMonthlyTotal(quote, recurringMonthlyTotal, equipmentTotal);
  const presence = getQuoteContentPresence(quote);

  const items: ProposalCommercialSummaryItem[] = [];
  if (annual.items.length) {
    items.push({ key: "annual-subscriptions", label: "Year 1 annual subscriptions", value: annual.firstYearTotal });
    items.push({ key: "annual-renewals", label: "Annual renewals from Year 2", value: annual.renewalTotal });
  }

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
  }

  if (quotedSalesTax > 0) {
    items.push({
      key: "sales-tax",
      label: "Quoted sales tax",
      value: quotedSalesTax,
    });
  }

  if (presence.hasSectionCContent || quotedSalesTax > 0) {
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

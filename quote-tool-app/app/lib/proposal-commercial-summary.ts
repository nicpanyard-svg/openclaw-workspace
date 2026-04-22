import type { EquipmentPricingRow, PerKitPricingRow, PoolPricingRow, QuoteRecord, ServicePricingRow } from "@/app/lib/quote-record";

export type CommercialSummaryItemTone = "default" | "accent";

export type ProposalCommercialSummaryItem = {
  key: string;
  label: string;
  value: number;
  tone?: CommercialSummaryItemTone;
};

function getSectionARows(sectionA: QuoteRecord["sections"]["sectionA"]) {
  return sectionA.mode === "pool" ? sectionA.poolRows : sectionA.perKitRows;
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
  return [quote.executiveSummary.customerContext, quote.executiveSummary.body, ...(quote.executiveSummary.paragraphs ?? [])]
    .some((entry) => (entry ?? "").trim().length > 0);
}

export function hasCustomerVisibleCustomFieldData(quote: QuoteRecord) {
  return (quote.customFields ?? []).some(
    (field) => field.visibility === "customer" && field.label.trim().length > 0 && field.value.trim().length > 0,
  );
}

export function getQuoteContentPresence(quote: QuoteRecord) {
  const sectionARows = getSectionARows(quote.sections.sectionA);
  const hasSectionAContent = hasSectionARows(sectionARows);
  const hasSectionBContent = hasEquipmentRows(quote.sections.sectionB.lineItems);
  const hasSectionCContent = hasServiceRows(quote.sections.sectionC.lineItems);

  return {
    hasSectionAContent,
    hasSectionBContent,
    hasSectionCContent,
    hasExecutiveSummaryContent: hasExecutiveSummaryContent(quote),
    hasCustomerVisibleCustomFieldData: hasCustomerVisibleCustomFieldData(quote),
  };
}

export function getRecurringMonthlyTotal(quote: QuoteRecord) {
  return Number(
    getSectionARows(quote.sections.sectionA)
      .reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0)
      .toFixed(2),
  );
}

export function getEquipmentTotal(quote: QuoteRecord) {
  return Number(
    quote.sections.sectionB.lineItems
      .reduce((sum, row) => sum + (row.totalPrice ?? 0), 0)
      .toFixed(2),
  );
}

export function getOptionalServicesTotal(quote: QuoteRecord) {
  return Number(
    quote.sections.sectionC.lineItems
      .reduce((sum, row) => sum + (row.totalPrice ?? 0), 0)
      .toFixed(2),
  );
}

export function getCombinedOneTimeTotal(
  quote: QuoteRecord,
  equipmentTotal?: number,
  optionalServicesTotal?: number,
) {
  const equipment = equipmentTotal ?? getEquipmentTotal(quote);
  const services = optionalServicesTotal ?? getOptionalServicesTotal(quote);
  return Number((equipment + services).toFixed(2));
}

export function getLeaseMonthlyTotal(quote: QuoteRecord, recurringMonthlyTotal?: number, equipmentTotal?: number) {
  if (quote.metadata.quoteType !== "lease") return 0;
  if (!quote.metadata.hasActiveDataAgreement) return 0;

  const recurring = recurringMonthlyTotal ?? getRecurringMonthlyTotal(quote);
  const equipment = equipmentTotal ?? getEquipmentTotal(quote);
  const marginPercent = quote.metadata.leaseMarginPercent ?? 35;
  const leaseBase = equipment * (1 + marginPercent / 100);
  const term = quote.metadata.leaseTermMonths ?? 12;

  return Number((recurring + leaseBase / term).toFixed(2));
}

export function buildProposalCommercialSummary(quote: QuoteRecord): ProposalCommercialSummaryItem[] {
  const recurringMonthlyTotal = getRecurringMonthlyTotal(quote);
  const equipmentTotal = getEquipmentTotal(quote);
  const optionalServicesTotal = getOptionalServicesTotal(quote);
  const combinedOneTimeTotal = getCombinedOneTimeTotal(quote, equipmentTotal, optionalServicesTotal);
  const leaseMonthlyTotal = getLeaseMonthlyTotal(quote, recurringMonthlyTotal, equipmentTotal);
  const presence = getQuoteContentPresence(quote);

  const items: ProposalCommercialSummaryItem[] = [
    {
      key: "recurring-monthly",
      label: "Monthly recurring",
      value: recurringMonthlyTotal,
    },
  ];

  if (presence.hasSectionBContent) {
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

  if (quote.metadata.quoteType === "lease") {
    items.push({
      key: "estimated-lease-monthly",
      label: "Estimated lease monthly",
      value: leaseMonthlyTotal,
      tone: "accent",
    });
  }

  return items;
}

import type { QuoteLineBilling, QuoteRecord } from "./quote-record";

type BillingSource = {
  billing?: QuoteLineBilling;
  itemName?: string;
  label?: string;
  customerFacingLabel?: string;
  internalName?: string;
  description?: string;
};

export function getLineBilling(row: BillingSource, defaultCadence: QuoteLineBilling["cadence"] = "one_time"): QuoteLineBilling {
  if (row.billing && ["one_time", "monthly", "annual"].includes(row.billing.cadence)) {
    return { cadence: row.billing.cadence, startsYear: row.billing.startsYear === 2 ? 2 : 1, unitLabel: row.billing.unitLabel?.trim() || undefined };
  }
  // These named subscriptions were confirmed as annual in existing SARA quotes.
  // Do not infer cadence from generic prose about licenses, warranties, or terms.
  const label = (row.itemName || row.label || row.customerFacingLabel || row.internalName || row.description || "").trim();
  if (/^os[\s\u2022.-]*board\b/i.test(label)) return { cadence: "annual", startsYear: 1, unitLabel: "subscription" };
  if (/^axis\s+camera\s+station\s+cloud\s+storage\b/i.test(label)) return { cadence: "annual", startsYear: 1, unitLabel: "camera sensor" };
  if (/^(?:camlevel|camflood)[-\s]+edge\s+serenity\s+plan\b/i.test(label)) return { cadence: "annual", startsYear: 2, unitLabel: "application" };
  return { cadence: defaultCadence, startsYear: 1 };
}

export function isAnnualLine(row: BillingSource) {
  return getLineBilling(row).cadence === "annual";
}

export type AnnualSubscriptionItem = {
  key: string;
  id: string;
  sourceSection: "sectionA" | "sectionB" | "sectionC";
  label: string;
  description?: string;
  quantity: number | null;
  unitLabel: string;
  unitPrice?: number;
  annualAmount: number;
  firstYearAmount: number;
  startsYear: 1 | 2;
  optional: boolean;
};

export function getAnnualSubscriptionItems(quote: QuoteRecord): AnnualSubscriptionItem[] {
  const { sectionA: a, sectionB: b, sectionC: c } = quote.sections;
  const rows = [
    ...(a.enabled ? (a.mode === "pool" ? a.poolRows : a.perKitRows).filter((row) => row.rowType !== "overage").map((row) => ({ row, sourceSection: "sectionA" as const, label: row.description, description: row.includedText?.join("\n"), amount: row.totalMonthlyRate ?? 0, unit: row.unitLabel })) : []),
    ...(b.enabled ? b.lineItems.map((row) => ({ row, sourceSection: "sectionB" as const, label: row.itemName, description: row.description, amount: row.totalPrice, unit: undefined })) : []),
    ...(c.enabled ? c.lineItems.map((row) => ({ row, sourceSection: "sectionC" as const, label: row.description, description: row.notes, amount: row.totalPrice, unit: row.unitLabel })) : []),
  ];
  return rows.filter(({ row }) => isAnnualLine(row)).map(({ row, sourceSection, label, description, amount, unit }) => {
    const billing = getLineBilling(row);
    const annualAmount = Number((Number.isFinite(amount) ? amount : 0).toFixed(2));
    const quantity = row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0 ? row.quantity : null;
    return {
      key: `${sourceSection}-${row.id}`, id: row.id, sourceSection, label, description,
      quantity, unitLabel: billing.unitLabel || unit || "subscription",
      unitPrice: quantity ? Number((annualAmount / quantity).toFixed(4)) : undefined,
      annualAmount, firstYearAmount: billing.startsYear === 2 ? 0 : annualAmount,
      startsYear: billing.startsYear === 2 ? 2 : 1, optional: row.optional === true,
    };
  });
}

export function getAnnualSubscriptionSummary(quote: QuoteRecord) {
  const items = getAnnualSubscriptionItems(quote).filter((item) => !item.optional);
  const firstYearTotal = Number(items.reduce((sum, item) => sum + item.firstYearAmount, 0).toFixed(2));
  const renewalTotal = Number(items.reduce((sum, item) => sum + item.annualAmount, 0).toFixed(2));
  return { items, firstYearTotal, renewalTotal, monthlyEquivalent: Number((firstYearTotal / 12).toFixed(2)) };
}

import type { MajorProjectComponent, QuotePriceStatus, QuoteRecord } from "./quote-record";
import { applyMajorProjectToQuote, buildMajorProjectMetrics, getActiveMajorProjectOption } from "./major-project";

export type QuotePriceSource = {
  priceStatus?: QuotePriceStatus;
  id?: string;
  label?: string;
  itemName?: string;
  description?: string;
  internalName?: string;
  customerFacingLabel?: string;
  includedText?: string[];
  optional?: boolean;
  rowType?: string;
  quantity?: number | null;
  unitPrice?: number | null;
  monthlyRate?: number | null;
  totalMonthlyRate?: number | null;
  totalPrice?: number;
  customerUnitPrice?: number;
  customerExtendedPrice?: number;
  amount?: number;
  annualAmount?: number;
  rate?: number;
  usageBased?: boolean;
  sourceLabel?: string;
  quickQuoteSource?: { usageBased?: boolean };
};

export const QUOTE_PRICE_STATUSES = ["confirmed", "allowance", "tbd", "included"] as const;
export const QUOTE_PRICE_STATUS_LABELS: Record<QuotePriceStatus, string> = {
  confirmed: "Price set", allowance: "Estimated price", tbd: "Needs pricing", included: "No extra charge",
};

export const QUOTE_PRICE_STATUS_HELP: Record<QuotePriceStatus, string> = {
  confirmed: "The price shown is ready to quote.",
  allowance: "Estimated charge. Final price may change.",
  tbd: "Enter a selling price before final export.",
  included: "No separate charge. This line must be $0.",
};

export function normalizeQuoteLinePriceStatus(value: unknown): QuotePriceStatus | undefined {
  if (value == null) return undefined;
  return QUOTE_PRICE_STATUSES.includes(value as QuotePriceStatus) ? value as QuotePriceStatus : "tbd";
}

function priceValues(line: QuotePriceSource) {
  const usage = line.rowType === "overage" || line.quickQuoteSource?.usageBased === true || line.usageBased === true;
  const unit = line.customerUnitPrice ?? line.monthlyRate ?? line.unitPrice ?? line.rate;
  const total = line.customerExtendedPrice ?? line.totalPrice ?? line.totalMonthlyRate ?? line.annualAmount ?? line.amount;
  return { usage, unit, total, amount: usage ? unit : total ?? unit };
}

export function getQuoteLinePriceStatus(line: QuotePriceSource): QuotePriceStatus {
  const explicit = normalizeQuoteLinePriceStatus(line.priceStatus);
  if (explicit) return explicit;
  const { amount } = priceValues(line);
  // Nonzero credits are deliberate prices too. Zero never means free by inference.
  return typeof amount === "number" && Number.isFinite(amount) && amount !== 0 ? "confirmed" : "tbd";
}

export function setQuoteLinePriceStatus<T extends QuotePriceSource>(line: T, status: QuotePriceStatus): T & { priceStatus: QuotePriceStatus } {
  return { ...line, priceStatus: normalizeQuoteLinePriceStatus(status) ?? "tbd" };
}

export function confirmEditedQuotePrice<T extends QuotePriceSource>(previous: T, next: T): T {
  const before = priceValues(previous);
  const after = priceValues(next);
  if (before.unit === after.unit || getQuoteLinePriceStatus(next) !== "tbd") return next;
  const confirmed = { ...next, priceStatus: "confirmed" as const };
  return getQuoteLinePriceProblem(confirmed) === null ? confirmed : next;
}

export function quotePriceLineLabel(line: QuotePriceSource) {
  return line.customerFacingLabel?.trim() || line.label?.trim() || line.itemName?.trim()
    || line.internalName?.trim() || line.description?.trim() || "Unnamed item";
}

export function hasQuotePriceContent(line: QuotePriceSource) {
  return quotePriceLineLabel(line) !== "Unnamed item" || Boolean(line.includedText?.some(text => text.trim()))
    || Object.values(priceValues(line)).some(value => typeof value === "number" && value !== 0);
}

export function getQuoteLinePriceProblem(line: QuotePriceSource): string | null {
  const status = getQuoteLinePriceStatus(line);
  const { unit, total, amount, usage } = priceValues(line);
  if ([unit, total].some(value => value != null && !Number.isFinite(value))) return "Enter a valid price.";
  if (status === "included") {
    return [unit, total].some(value => value != null && value !== 0)
      ? "This item still has a price. Enter $0 for No extra charge, or choose Price set. The amount has not been changed." : null;
  }
  if (status === "tbd") return "Enter a selling price. If there is no separate charge, choose No extra charge.";
  if (!usage && total == null && unit != null && unit !== 0) return "Enter the line total. A unit price alone does not confirm the charge.";
  if (status === "confirmed" && amount === 0 && line.sourceLabel === "Major Project customer bundle") return null;
  if (amount == null || amount === 0) return `Enter a ${usage ? "usage rate" : "selling price"}, or choose No extra charge for a $0 item.`;
  if (status === "allowance" && amount < 0) return "An estimated price must be positive. For a credit, choose Price set.";
  if (!usage && total != null && unit != null && unit !== 0 && total === 0) return "Review the zero line total before confirming the price.";
  return null;
}

// Resolve presentation metadata from all backing items, including hidden cost-only items.
// A bundle-level Confirmed/Included selection must not conceal a child's unresolved price.
export function getMappedQuotePriceStatus(line: QuotePriceSource, children: QuotePriceSource[]): QuotePriceStatus {
  const own = normalizeQuoteLinePriceStatus(line.priceStatus);
  const meaningful = children.filter(hasQuotePriceContent);
  if (own === "tbd" || meaningful.some(child => getQuoteLinePriceProblem(child))) return "tbd";
  if (own === "allowance" || meaningful.some(child => getQuoteLinePriceStatus(child) === "allowance")) return "allowance";
  if (own === "included") return "included";
  if (meaningful.length) return meaningful.every(child => getQuoteLinePriceStatus(child) === "included") ? "included" : "confirmed";
  return getQuoteLinePriceStatus(line);
}

export function formatQuoteLinePrice(line: QuotePriceSource, formattedAmount: string, audience: "customer" | "editor" = "customer") {
  const status = getQuoteLinePriceStatus(line);
  if (status === "tbd") return audience === "editor" ? QUOTE_PRICE_STATUS_LABELS.tbd : "TBD";
  if (status === "included") return getQuoteLinePriceProblem(line) ? "Pricing needs review" : audience === "editor" ? QUOTE_PRICE_STATUS_LABELS.included : "Included";
  if (getQuoteLinePriceProblem(line)) return "Pricing needs review";
  return status === "allowance" ? `${formattedAmount} (${audience === "editor" ? "estimate" : "Allowance"})` : formattedAmount;
}

export function isQuickQuoteCostAllocation(component: MajorProjectComponent) {
  return /^quick-quote-cost-(oneTimeEquipmentCost|oneTimeLaborCost|oneTimeOtherCost|recurringVendorCost|recurringSupportCost|recurringOtherCost|annualSubscriptionCost)(-\d+)?$/.test(component.id)
    && !component.quickQuoteSource && !component.customerFacingLabel?.trim()
    && component.customerUnitPrice === 0 && component.customerExtendedPrice === 0;
}

export type QuotePricingIssue = {
  id: string;
  label: string;
  location: string;
  optional: boolean;
  status: QuotePriceStatus;
  kind: "unpriced" | "contradiction";
  message: string;
};

export function getQuotePricingSummary(quote: QuoteRecord) {
  const issues: QuotePricingIssue[] = [];
  const usageExcluded = quote.orderProcessing?.overageOptIn === "no" || quote.orderProcessing?.overageOptIn === "not_applicable";
  const add = (row: QuotePriceSource, location: string, optional = row.optional === true) => {
    if (usageExcluded && priceValues(row).usage) return;
    if (!hasQuotePriceContent(row)) return;
    const problem = getQuoteLinePriceProblem(row);
    if (!problem) return;
    const status = getQuoteLinePriceStatus(row);
    const label = quotePriceLineLabel(row);
    issues.push({ id: row.id ?? "", label, location, optional, status,
      kind: status === "tbd" ? "unpriced" : "contradiction",
      message: `${location}: ${label}. ${problem}` });
  };
  const major = quote.metadata.workflowMode === "major_project" && quote.majorProject?.enabled;
  if (major) {
    const metrics = buildMajorProjectMetrics(quote);
    const option = getActiveMajorProjectOption(quote);
    const optionalLine = (line: typeof metrics.customerQuoteLines[number]) => line.optional === true
      || line.resolvedBundleIds.some(id => metrics.bundles.find(bundle => bundle.id === id)?.optional)
      || (line.revenueComponents.length > 0 && line.revenueComponents.every(component => component.optional));
    const sourceComponents = option?.components?.length ? option.components : metrics.components;
    for (const component of sourceComponents) {
      if (option?.quickQuoteSource && isQuickQuoteCostAllocation(component)) continue;
      const presenters = metrics.customerQuoteLines.filter(line => line.resolvedCostComponentIds.includes(component.id) || line.resolvedRevenueComponentIds.includes(component.id));
      const bundles = metrics.bundles.filter(bundle => bundle.resolvedComponentIds.includes(component.id));
      const optional = presenters.length > 0 ? presenters.every(optionalLine)
        : component.optional === true || (bundles.length > 0 && bundles.every(bundle => bundle.optional));
      add(component, "Major Project / Components", optional);
    }
    if (!sourceComponents.length) (option?.simpleRows ?? []).forEach(row => add(row, "Major Project / Line items"));
    // Check only explicit parent statuses here; inferred parents are represented by child issues.
    for (const bundle of metrics.bundles) {
      const original = option?.bundles?.find(row => row.id === bundle.id);
      if (original?.priceStatus == null) continue;
      add({ ...original, totalPrice: bundle.oneTimeRevenue + bundle.recurringRevenue + bundle.annualRevenue }, "Major Project / Bundles");
    }
    for (const line of metrics.customerQuoteLines) {
      const original = option?.customerQuoteLines?.find(row => row.id === line.id);
      if (original?.priceStatus == null) continue;
      add({ ...original, totalPrice: line.oneTimeRevenue + line.recurringRevenue + line.annualRevenue }, "Major Project / Customer lines", optionalLine(line));
    }
    // Generated fees and legacy scalar models have no component to review.
    const output = applyMajorProjectToQuote(quote);
    const a = output.sections.sectionA;
    if (a.enabled) (a.mode === "pool" ? a.poolRows : a.perKitRows)
      .filter(row => !sourceComponents.length || ["major_terminal_fee", "major_overage"].includes(row.id))
      .forEach(row => add(row, "Monthly services"));
  } else {
    const { sectionA: a, sectionB: b, sectionC: c } = quote.sections;
    if (a.enabled) (a.mode === "pool" ? a.poolRows : a.perKitRows).forEach(row => add(row, "Monthly services"));
    if (b.enabled) b.lineItems.forEach(row => add(row, "Equipment"));
    if (c.enabled) c.lineItems.forEach(row => add(row, "Services"));
  }
  const exportErrors = issues.filter(issue => !issue.optional || issue.kind === "contradiction").map(issue => issue.message);
  return {
    requiredUnpricedCount: issues.filter(issue => !issue.optional).length,
    optionalUnpricedCount: issues.filter(issue => issue.optional).length,
    issues, exportErrors, canExport: exportErrors.length === 0,
  };
}

/** Normalize metadata only. Do not infer and persist a status from a changing price. */
export function normalizeQuotePriceStatuses(quote: QuoteRecord): QuoteRecord {
  const normalize = <T extends { priceStatus?: QuotePriceStatus }>(row: T): T => row.priceStatus == null ? row
    : { ...row, priceStatus: normalizeQuoteLinePriceStatus(row.priceStatus) };
  const sections = (source: QuoteRecord["sections"]): QuoteRecord["sections"] => ({
    sectionA: { ...source.sectionA, poolRows: source.sectionA.poolRows.map(normalize), perKitRows: source.sectionA.perKitRows.map(normalize) },
    sectionB: { ...source.sectionB, lineItems: source.sectionB.lineItems.map(normalize) },
    sectionC: { ...source.sectionC, lineItems: source.sectionC.lineItems.map(normalize) },
  });
  return { ...quote, sections: sections(quote.sections), majorProject: { ...quote.majorProject, options: quote.majorProject.options.map(option => ({
    ...option, simpleRows: option.simpleRows?.map(normalize), components: option.components?.map(normalize),
    bundles: option.bundles?.map(normalize), customerQuoteLines: option.customerQuoteLines?.map(normalize),
    ...(option.quickQuoteSource ? { quickQuoteSource: { ...option.quickQuoteSource, sections: sections(option.quickQuoteSource.sections) } } : {}),
  })) } };
}

import type {
  MajorProjectBuilderMode,
  MajorProjectComponent,
  MajorProjectOption,
  MajorProjectSimpleRow,
  QuoteLineBilling,
  QuotePriceStatus,
  QuoteRecord,
} from "./quote-record";
import { getLineBilling } from "./quote-line-billing";
import { getQuoteLinePriceStatus, isQuickQuoteCostAllocation } from "./quote-price-status";

export type BulkPricingLine = {
  id: string;
  label: string;
  quantity: number;
  cadence: QuoteLineBilling["cadence"];
  startsYear: 1 | 2;
  unit: string;
  usageBased: boolean;
  optional: boolean;
  priceLocked: boolean;
  priceStatus: QuotePriceStatus;
  cost: number | null;
  extendedCost: number | null;
  currentUnitPrice: number | null;
  currentExtendedPrice: number | null;
  eligible: boolean;
  skippedReason: string | null;
};

export type BulkMarginEntry = BulkPricingLine & {
  newUnitPrice: number | null;
  newExtendedPrice: number | null;
  newPriceStatus: QuotePriceStatus | null;
};

export type BulkMarginTotal = { current: number; proposed: number; change: number; lineCount: number };

export type BulkUsageMarginTotal = BulkMarginTotal & {
  id: string;
  label: string;
  unit: string;
  cadence: QuoteLineBilling["cadence"];
  optional: boolean;
};

export type BulkMarginTotals = {
  oneTime: BulkMarginTotal;
  monthly: BulkMarginTotal;
  annual: BulkMarginTotal;
  // Usage rates are separate entries, never a sum or a fixed monthly charge.
  usage: BulkUsageMarginTotal[];
};

export type BulkMarginPreview = {
  quoteId: string;
  optionId: string | null;
  mode: MajorProjectBuilderMode;
  marginPercent: number;
  selectedIds: string[];
  entries: BulkMarginEntry[];
  selectionCount: number;
  applicableCount: number;
  skippedCount: number;
  error: string | null;
  totals: BulkMarginTotals;
  inputFingerprint: string;
};

type PricingSource = MajorProjectComponent | MajorProjectSimpleRow;
const MAX_MONEY = Number.MAX_SAFE_INTEGER / 100;
const STALE_PREVIEW = "The quote or selected pricing changed. Refresh the margin preview before applying it.";

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function component(source: PricingSource): source is MajorProjectComponent {
  return "vendorUnitCost" in source || "internalName" in source;
}

function context(quote: QuoteRecord) {
  const project = quote.majorProject;
  const mode = project?.builderMode === "simple" ? "simple" as const : "advanced" as const;
  const enabled = quote.metadata.workflowMode === "major_project" && project?.enabled === true;
  const options = project?.options ?? [];
  const option = enabled ? options.find(candidate => candidate.id === project.activeOptionId) ?? options[0] : undefined;
  const rows: PricingSource[] = option ? mode === "simple" ? option.simpleRows ?? [] : option.components ?? [] : [];
  return { mode, option, rows, enabled };
}

function pricingLine(source: PricingSource, duplicates: Set<string>): BulkPricingLine {
  const advanced = component(source);
  const usageBased = advanced && source.quickQuoteSource?.usageBased === true;
  const defaultCadence = advanced ? source.schedule === "recurring" ? "monthly" : "one_time"
    : source.bucket === "hardware" || source.bucket === "install" ? "one_time" : "monthly";
  const billing = getLineBilling(source, defaultCadence);
  const cost = finiteNumber(advanced ? source.vendorUnitCost : source.ourUnitCost);
  const extendedCost = finiteNumber(advanced ? source.vendorExtendedCost : source.ourExtendedCost);
  const currentUnitPrice = finiteNumber(source.customerUnitPrice);
  const currentExtendedPrice = finiteNumber(source.customerExtendedPrice);
  const priceStatus = getQuoteLinePriceStatus(source);
  let skippedReason: string | null = null;

  if (!source.id || duplicates.has(source.id)) skippedReason = "The item ID is missing or duplicated. Resolve it before bulk pricing.";
  else if (source.priceLocked === true) skippedReason = "The selling price is locked. Unlock this item to change its price.";
  else if (advanced && isQuickQuoteCostAllocation(source)) skippedReason = "Quick Quote aggregate cost is not a per-item vendor cost.";
  else if (priceStatus === "included") skippedReason = "No extra charge items are not repriced.";
  else if (advanced && (source.passThrough || source.resaleBasis === "pass_through")) skippedReason = "Pass-through pricing is not repriced.";
  else if ([cost, extendedCost, currentUnitPrice, currentExtendedPrice, source.quantity].some(value => value !== null && value < 0)) skippedReason = "Credits and negative quantities are not repriced.";
  else if (!Number.isFinite(source.quantity) || source.quantity < 0 || (!usageBased && source.quantity === 0)) skippedReason = "Enter a valid positive quantity.";
  else if (cost === null || cost <= 0 || cost > MAX_MONEY) skippedReason = "Enter a valid positive unit cost.";
  else if (extendedCost === null || extendedCost < 0 || extendedCost > MAX_MONEY) skippedReason = "Enter a valid extended cost.";
  else if (extendedCost !== roundMoney(source.quantity * cost)) skippedReason = "Unit cost and extended cost do not match the quantity. Review the costs first.";
  else if (currentUnitPrice === null || currentExtendedPrice === null || currentUnitPrice > MAX_MONEY || currentExtendedPrice > MAX_MONEY) skippedReason = "Review the current selling price before bulk pricing.";
  else if (usageBased && currentExtendedPrice !== 0) skippedReason = "Usage rates must not include a fixed extended selling price.";

  return {
    id: source.id,
    label: advanced ? source.customerFacingLabel?.trim() || source.internalName?.trim() || "Unnamed item" : source.label?.trim() || "Unnamed item",
    quantity: source.quantity,
    cadence: billing.cadence,
    startsYear: billing.startsYear === 2 ? 2 : 1,
    unit: billing.unitLabel || source.unit || "ea",
    usageBased,
    optional: source.optional === true,
    priceLocked: source.priceLocked === true,
    priceStatus,
    cost,
    extendedCost,
    currentUnitPrice,
    currentExtendedPrice,
    eligible: skippedReason === null,
    skippedReason,
  };
}

export function getBulkPricingLines(quote: QuoteRecord): BulkPricingLine[] {
  const { rows } = context(quote);
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  rows.forEach(row => { if (seen.has(row.id)) duplicates.add(row.id); seen.add(row.id); });
  return rows.map(row => pricingLine(row, duplicates));
}

function fingerprint(quote: QuoteRecord, selectedIds: string[], marginPercent: number) {
  const { mode, option, rows, enabled } = context(quote);
  return JSON.stringify({
    quoteId: quote.internal.quoteId, enabled, activeOptionId: quote.majorProject?.activeOptionId,
    optionId: option?.id, mode, marginPercent, currency: quote.metadata.currencyCode,
    selected: selectedIds.map(id => ({ id, sources: rows.filter(row => row.id === id).map(row => {
      const advanced = component(row);
      return {
        id: row.id, label: advanced ? [row.internalName, row.customerFacingLabel] : row.label,
        quantity: row.quantity, unit: row.unit, billing: row.billing, optional: row.optional,
        priceStatus: row.priceStatus, priceLocked: row.priceLocked,
        customerUnitPrice: row.customerUnitPrice, customerExtendedPrice: row.customerExtendedPrice,
        unitCost: advanced ? row.vendorUnitCost : row.ourUnitCost,
        extendedCost: advanced ? row.vendorExtendedCost : row.ourExtendedCost,
        ...(advanced ? {
          schedule: row.schedule, passThrough: row.passThrough, resaleBasis: row.resaleBasis,
          costBasis: row.costBasis,
          quickQuoteSource: row.quickQuoteSource, lineType: row.lineType, laborTasks: row.laborTasks,
        } : { bucket: row.bucket }),
      };
    }) })),
  }, (_key, value) => typeof value === "number" && !Number.isFinite(value) ? String(value) : value);
}

function emptyTotal(): BulkMarginTotal {
  return { current: 0, proposed: 0, change: 0, lineCount: 0 };
}

function missingLine(id: string): BulkPricingLine {
  return {
    id, label: "Unavailable item", quantity: 0, cadence: "one_time", startsYear: 1, unit: "ea",
    usageBased: false, optional: false, priceLocked: false, priceStatus: "tbd", cost: null,
    extendedCost: null, currentUnitPrice: null, currentExtendedPrice: null, eligible: false,
    skippedReason: "This item is not in the active option and editor mode.",
  };
}

export function previewBulkMargin(quote: QuoteRecord, selectedIds: string[], marginPercent: number): BulkMarginPreview {
  const active = context(quote);
  const selection = [...new Set(selectedIds)];
  const byId = new Map(getBulkPricingLines(quote).map(line => [line.id, line]));
  const error = !active.enabled || !active.option ? "Bulk margins are available for Major Project line items only."
    : !Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 95
      ? "Enter a margin from 0% to 95%." : null;
  const entries: BulkMarginEntry[] = selection.map(id => {
    const line = byId.get(id) ?? missingLine(id);
    if (!line.eligible || error) return { ...line, eligible: false, skippedReason: line.skippedReason || error, newUnitPrice: null, newExtendedPrice: null, newPriceStatus: null };
    const newUnitPrice = roundMoney(line.cost! / (1 - marginPercent / 100));
    const newExtendedPrice = line.usageBased ? 0 : roundMoney(newUnitPrice * line.quantity);
    if (!Number.isFinite(newUnitPrice) || !Number.isFinite(newExtendedPrice) || newUnitPrice <= 0 || newUnitPrice > MAX_MONEY || newExtendedPrice > MAX_MONEY) {
      return { ...line, eligible: false, skippedReason: "The calculated price is outside the supported currency range.", newUnitPrice: null, newExtendedPrice: null, newPriceStatus: null };
    }
    return { ...line, newUnitPrice, newExtendedPrice, newPriceStatus: line.priceStatus === "tbd" ? "confirmed" as const : line.priceStatus };
  });
  const totals: BulkMarginTotals = { oneTime: emptyTotal(), monthly: emptyTotal(), annual: emptyTotal(), usage: [] };
  entries.filter(entry => entry.eligible).forEach(entry => {
    if (entry.usageBased) {
      totals.usage.push({
        id: entry.id, label: entry.label, unit: entry.unit, cadence: entry.cadence, optional: entry.optional,
        current: entry.currentUnitPrice!, proposed: entry.newUnitPrice!, change: roundMoney(entry.newUnitPrice! - entry.currentUnitPrice!), lineCount: 1,
      });
    } else {
      const bucket = totals[entry.cadence === "one_time" ? "oneTime" : entry.cadence];
      bucket.current = roundMoney(bucket.current + entry.currentExtendedPrice!);
      bucket.proposed = roundMoney(bucket.proposed + entry.newExtendedPrice!);
      bucket.change = roundMoney(bucket.proposed - bucket.current);
      bucket.lineCount += 1;
    }
  });
  const applicableCount = entries.filter(entry => entry.eligible).length;
  return {
    quoteId: quote.internal.quoteId, optionId: active.option?.id ?? null, mode: active.mode, marginPercent,
    selectedIds: selection, entries, selectionCount: selection.length, applicableCount,
    skippedCount: selection.length - applicableCount, error, totals,
    inputFingerprint: fingerprint(quote, selection, marginPercent),
  };
}

function updateActiveRows(quote: QuoteRecord, update: (row: PricingSource) => PricingSource): QuoteRecord {
  const { option, mode } = context(quote);
  if (!option) return quote;
  const nextOption: MajorProjectOption = mode === "simple"
    ? { ...option, simpleRows: (option.simpleRows ?? []).map(row => update(row) as MajorProjectSimpleRow) }
    : { ...option, components: (option.components ?? []).map(row => update(row) as MajorProjectComponent) };
  return { ...quote, majorProject: { ...quote.majorProject, options: quote.majorProject.options.map(candidate => candidate === option ? nextOption : candidate) } };
}

export function applyBulkMargin(quote: QuoteRecord, preview: BulkMarginPreview): { quote: QuoteRecord; updatedCount: number; skippedCount: number } {
  const fresh = previewBulkMargin(quote, preview.selectedIds, preview.marginPercent);
  if (preview.quoteId !== fresh.quoteId || preview.optionId !== fresh.optionId || preview.mode !== fresh.mode || preview.inputFingerprint !== fresh.inputFingerprint) throw new Error(STALE_PREVIEW);
  if (fresh.error) throw new Error(fresh.error);
  const applicable = new Map(fresh.entries.filter(entry => entry.eligible).map(entry => [entry.id, entry]));
  const next = applicable.size ? updateActiveRows(quote, row => {
    const entry = applicable.get(row.id);
    return entry ? {
      ...row,
      customerUnitPrice: entry.newUnitPrice!,
      customerExtendedPrice: entry.newExtendedPrice!,
      ...(entry.priceStatus === "tbd" ? { priceStatus: "confirmed" as const } : {}),
    } : row;
  }) : quote;
  return { quote: next, updatedCount: applicable.size, skippedCount: fresh.skippedCount };
}

export function setBulkPriceLocks(quote: QuoteRecord, selectedIds: string[], locked: boolean): QuoteRecord {
  const selected = new Set(selectedIds);
  return updateActiveRows(quote, row => selected.has(row.id) ? { ...row, priceLocked: locked } : row);
}

export function preserveLockedUnitPrice<T extends { priceLocked?: boolean; quantity: number; customerUnitPrice: number; customerExtendedPrice: number }>(previous: T, next: T): T {
  if (!previous.priceLocked) return next;
  const quantityChanged = next.quantity !== previous.quantity;
  return {
    ...next,
    customerUnitPrice: previous.customerUnitPrice,
    customerExtendedPrice: quantityChanged ? roundMoney(next.quantity * previous.customerUnitPrice) : previous.customerExtendedPrice,
  };
}

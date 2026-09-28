import type { PerKitPricingRow, PoolPricingRow, QuoteRecord } from "./quote-record";

export type OverageTerms = {
  decision: "pending" | "yes" | "no";
  amount: number | null;
  basis: string;
  conflict: boolean;
  planMismatch: boolean;
};

export function getOveragePlan(quote: QuoteRecord): "pool" | "blocks" {
  const requirements = quote.orderProcessing?.requirements;
  if (requirements?.corporatePricing === "no") {
    if (requirements.pricingStructure === "pool") return "pool";
    if (requirements.pricingStructure === "individual") return "blocks";
  }
  if (quote.metadata.workflowMode === "major_project" && quote.majorProject?.enabled) {
    return quote.majorProject.commercial.serviceMix === "starlink-pool" ? "pool" : "blocks";
  }
  return quote.sections.sectionA.mode === "pool" ? "pool" : "blocks";
}

export function getOverageDefault(quote: QuoteRecord): { amount: number; basis: string } {
  return getOveragePlan(quote) === "pool"
    ? { amount: 0.55, basis: "per GB" }
    : { amount: 32.5, basis: "per 50GB block" };
}

function basisText(value: unknown): string {
  if (typeof value !== "string") return "";
  const unit = value.trim().replace(/^per\s+/i, "").replace(/\s+/g, " ");
  const normalized = /^50\s*gb(?:\s*block)?$/i.test(unit) ? "50GB block" : unit.toLowerCase() === "gb" ? "GB" : unit;
  return normalized ? `per ${normalized}` : "";
}

export function isOverageBasisCompatible(quote: QuoteRecord, basis: string): boolean {
  return basisText(basis) === getOverageDefault(quote).basis;
}

function validAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function activeRows(sections: QuoteRecord["sections"]): Array<PoolPricingRow | PerKitPricingRow> {
  const section = sections.sectionA;
  return section.enabled ? (section.mode === "pool" ? section.poolRows : section.perKitRows) : [];
}

/** Resolve existing prices without changing the quote or inventing a default. */
export function resolveOverageTerms(quote: QuoteRecord): OverageTerms {
  const choice = quote.orderProcessing?.overageOptIn;
  const decision = choice === "yes" || choice === "no" ? choice : "pending";
  const rate = quote.orderProcessing?.requirements?.rates.overages;
  const structuredBasis = basisText(rate?.basis);
  // An explicit edit, including a cleared field, must not fall back to stale rows.
  const structured = rate?.status === "priced"
    ? { amount: validAmount(rate.amount) ? rate.amount : null, basis: structuredBasis } : null;
  const legacy = activeRows(quote.sections).flatMap(row => {
    if (row.rowType !== "overage" || row.optional) return [];
    const amount = row.monthlyRate ?? row.unitPrice;
    const basis = basisText(row.unitLabel);
    return validAmount(amount) && basis ? [{ amount, basis }] : [];
  });
  const equal = (left: { amount: number; basis: string }, right: { amount: number; basis: string }) =>
    left.amount === right.amount && left.basis.toLowerCase() === right.basis.toLowerCase();
  const candidate = structured ?? legacy[0];
  const conflict = Boolean(candidate && candidate.amount !== null && candidate.basis
    && legacy.some(rate => !equal({ amount: candidate.amount!, basis: candidate.basis }, rate)));
  return {
    decision,
    amount: candidate && (structured || !conflict) ? candidate.amount : null,
    basis: candidate?.basis ?? structuredBasis,
    conflict,
    planMismatch: Boolean(candidate?.basis && !isOverageBasisCompatible(quote, candidate.basis)),
  };
}

/** Returns a clone. Callers initialize orderProcessing.requirements before editing. */
export function setOveragePrice(quote: QuoteRecord, amount: number | null, basis = getOverageDefault(quote).basis): QuoteRecord {
  if (!quote.orderProcessing?.requirements) throw new Error("Initialize order details before setting an overage price.");
  const next = structuredClone(quote);
  const price = validAmount(amount) ? amount : null;
  const normalizedBasis = basisText(basis);
  const unit = normalizedBasis.replace(/^per\s+/i, "");
  next.orderProcessing!.requirements!.rates.overages = { status: "priced", amount: price, basis: normalizedBasis };
  const syncRows = (sections: QuoteRecord["sections"]) => {
    for (const row of activeRows(sections)) {
      if (row.rowType !== "overage" || row.optional) continue;
      row.unitPrice = price;
      row.monthlyRate = price;
      row.unitLabel = unit;
      row.totalMonthlyRate = 0;
    }
  };
  syncRows(next.sections);
  if (next.metadata.workflowMode === "major_project" && next.majorProject?.enabled) {
    next.majorProject.commercial.overageRatePerGb = price ?? 0;
    const option = next.majorProject.options.find(option => option.id === next.majorProject.activeOptionId) ?? next.majorProject.options[0];
    if (option?.quickQuoteSource) {
      const sourceRows = activeRows(option.quickQuoteSource.sections);
      for (const component of option.components ?? []) {
        const reference = component.quickQuoteSource;
        if (!reference?.usageBased || reference.section !== "sectionA" || component.optional
          || !sourceRows.some(row => row.id === reference.rowId && row.rowType === "overage" && !row.optional)) continue;
        component.customerUnitPrice = price ?? 0;
        component.customerExtendedPrice = 0;
        component.unit = unit;
      }
      syncRows(option.quickQuoteSource.sections);
    }
  }
  return next;
}

import type { QuoteCommercialState, QuoteRecord } from "@/app/lib/quote-record";
import { buildMajorProjectMetrics, ensureMajorProjectState } from "@/app/lib/major-project";

export function createDefaultCommercialState(): QuoteCommercialState {
  return {
    internalOnly: true,
    phase: "margin-foundation",
    meta: {
      optionLabel: "Option 1",
      comparisonGroup: "Base deal",
      notes: "",
    },
    costs: {
      oneTimeEquipmentCost: 0,
      oneTimeLaborCost: 0,
      oneTimeOtherCost: 0,
      recurringVendorCost: 0,
      recurringSupportCost: 0,
      recurringOtherCost: 0,
    },
  };
}

export function ensureCommercialState(quote: QuoteRecord): QuoteRecord {
  return {
    ...quote,
    commercial: {
      ...createDefaultCommercialState(),
      ...quote.commercial,
      meta: {
        ...createDefaultCommercialState().meta,
        ...quote.commercial?.meta,
      },
      costs: {
        ...createDefaultCommercialState().costs,
        ...quote.commercial?.costs,
      },
    },
  };
}

export function buildCommercialMetrics(quote: QuoteRecord) {
  const hydratedQuote = ensureCommercialState(ensureMajorProjectState(quote));
  const sectionARows = hydratedQuote.sections.sectionA.mode === "pool" ? hydratedQuote.sections.sectionA.poolRows : hydratedQuote.sections.sectionA.perKitRows;
  const quickRecurringRevenue = Number(sectionARows.reduce((sum, row) => sum + (row.totalMonthlyRate ?? 0), 0).toFixed(2));
  const quickOneTimeEquipmentRevenue = Number(hydratedQuote.sections.sectionB.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? 0), 0).toFixed(2));
  const quickOneTimeServicesRevenue = Number(hydratedQuote.sections.sectionC.lineItems.reduce((sum, row) => sum + (row.totalPrice ?? 0), 0).toFixed(2));

  const majorProjectMetrics = buildMajorProjectMetrics(hydratedQuote);
  const useMajorProjectRevenue = hydratedQuote.metadata.workflowMode === "major_project" && Boolean(hydratedQuote.majorProject?.enabled);
  const recurringRevenue = useMajorProjectRevenue ? Number(majorProjectMetrics.recurringRevenue.toFixed(2)) : quickRecurringRevenue;
  const oneTimeEquipmentRevenue = useMajorProjectRevenue ? Number(majorProjectMetrics.oneTimeRevenue.toFixed(2)) : quickOneTimeEquipmentRevenue;
  const oneTimeServicesRevenue = useMajorProjectRevenue ? 0 : quickOneTimeServicesRevenue;
  const oneTimeRevenue = Number((oneTimeEquipmentRevenue + oneTimeServicesRevenue).toFixed(2));

  const costs = hydratedQuote.commercial.costs;
  const recurringCost = Number((costs.recurringVendorCost + costs.recurringSupportCost + costs.recurringOtherCost).toFixed(2));
  const oneTimeCost = Number((costs.oneTimeEquipmentCost + costs.oneTimeLaborCost + costs.oneTimeOtherCost).toFixed(2));

  const recurringGrossProfit = Number((recurringRevenue - recurringCost).toFixed(2));
  const oneTimeGrossProfit = Number((oneTimeRevenue - oneTimeCost).toFixed(2));
  const totalRevenue = Number((recurringRevenue + oneTimeRevenue).toFixed(2));
  const totalCost = Number((recurringCost + oneTimeCost).toFixed(2));
  const totalGrossProfit = Number((totalRevenue - totalCost).toFixed(2));

  const safeMargin = (profit: number, revenue: number) => (revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0);

  return {
    recurringRevenue,
    recurringCost,
    recurringGrossProfit,
    recurringGrossMarginPercent: safeMargin(recurringGrossProfit, recurringRevenue),
    oneTimeEquipmentRevenue,
    oneTimeServicesRevenue,
    oneTimeRevenue,
    oneTimeCost,
    oneTimeGrossProfit,
    oneTimeGrossMarginPercent: safeMargin(oneTimeGrossProfit, oneTimeRevenue),
    totalRevenue,
    totalCost,
    totalGrossProfit,
    totalGrossMarginPercent: safeMargin(totalGrossProfit, totalRevenue),
  };
}

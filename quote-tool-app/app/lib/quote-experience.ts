import type { LeaseTermMonths, QuoteRecord } from "./quote-record";
import { applyMajorProjectToQuote } from "./major-project";
import { getWorkspaceQuoteSummary } from "./workspace-quote-summary";

export const comparisonLeaseTerms: LeaseTermMonths[] = [3, 6, 9, 12, 24, 36];
export function getComparisonScenarios(
  quote: QuoteRecord,
  mode: "options" | "terms",
) {
  const scenarios =
    mode === "options" &&
    quote.metadata.workflowMode === "major_project" &&
    quote.majorProject?.enabled
      ? quote.majorProject.options.map((option) => {
          const draft = structuredClone(quote);
          draft.majorProject!.activeOptionId = option.id;
          return {
            id: option.id,
            label: option.label,
            siteCount: option.siteCount,
            quote: applyMajorProjectToQuote(draft),
            selected: option.id === quote.majorProject!.activeOptionId,
          };
        })
      : [null, ...comparisonLeaseTerms].map((term) => {
          const draft = structuredClone(quote);
          draft.metadata.quoteType = term ? "lease" : "purchase";
          if (term) draft.metadata.leaseTermMonths = term;
          return {
            id: term ? `lease-${term}` : "purchase",
            label: term ? `${term}-month lease` : "Purchase",
            siteCount: null,
            quote: draft,
            selected: term
              ? quote.metadata.quoteType === "lease" &&
                (quote.metadata.leaseTermMonths ?? 12) === term
              : quote.metadata.quoteType !== "lease",
          };
        });
  return scenarios.map(({ quote: scenario, ...rest }) => ({
    ...rest,
    ...getWorkspaceQuoteSummary(scenario),
    currency: scenario.metadata.currencyCode || "USD",
  }));
}

export function getPricingReviewItems(
  quote: QuoteRecord,
): { message: string; tab: "customer" | "items" }[] {
  const items: { message: string; tab: "customer" | "items" }[] = [];
  if (!quote.customer.addressLines.some((line) => line.trim()))
    items.push({ message: "Confirm the service address.", tab: "customer" });
  const rows = [
    ...(quote.sections.sectionA.enabled
      ? (quote.sections.sectionA.mode === "pool"
          ? quote.sections.sectionA.poolRows
          : quote.sections.sectionA.perKitRows
        )
          .filter((row) => row.rowType !== "overage")
          .map((row) => ({
            label: row.description,
            quantity: row.quantity,
            amount: row.totalMonthlyRate ?? 0,
          }))
      : []),
    ...(quote.sections.sectionB.enabled
      ? quote.sections.sectionB.lineItems.map((row) => ({
          label: row.itemName,
          quantity: row.quantity,
          amount: row.totalPrice,
        }))
      : []),
    ...(quote.sections.sectionC.enabled
      ? quote.sections.sectionC.lineItems.map((row) => ({
          label: row.description,
          quantity: row.quantity,
          amount: row.totalPrice,
        }))
      : []),
  ];
  const unpriced = rows.filter((row) => row.label.trim() && row.amount === 0);
  if (unpriced.length)
    items.push({
      message: `Confirm ${unpriced.length} zero-priced line item${unpriced.length === 1 ? "" : "s"} (included items may be intentional).`,
      tab: "items",
    });
  const invalid = rows.filter(
    (row) =>
      !Number.isFinite(row.amount) ||
      (row.quantity != null &&
        (!Number.isFinite(row.quantity) || row.quantity <= 0)),
  );
  if (invalid.length)
    items.push({
      message: `Check quantities and amounts on ${invalid.length} line item${invalid.length === 1 ? "" : "s"}.`,
      tab: "items",
    });
  return items;
}

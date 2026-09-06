import type { EquipmentPricingRow, QuoteRecord } from "@/app/lib/quote-record";
import { getIncludedEquipmentRows, getQuoteContentPresence } from "@/app/lib/proposal-commercial-summary";

const EQUIPMENT_FIRST_PAGE_ROW_LIMIT = 5;
const EQUIPMENT_CONTINUATION_PAGE_ROW_LIMIT = 7;

export function chunkRowsForProposalPages<T>(
  rows: T[],
  firstPageLimit: number,
  continuationPageLimit = firstPageLimit,
) {
  if (!rows.length) return [];

  const safeFirstPageLimit = Math.max(1, Math.floor(firstPageLimit));
  const safeContinuationPageLimit = Math.max(1, Math.floor(continuationPageLimit));
  const chunks: T[][] = [rows.slice(0, safeFirstPageLimit)];

  for (let index = safeFirstPageLimit; index < rows.length; index += safeContinuationPageLimit) {
    chunks.push(rows.slice(index, index + safeContinuationPageLimit));
  }

  return chunks;
}

export function chunkEquipmentRowsForProposalPages(rows: EquipmentPricingRow[]) {
  return chunkRowsForProposalPages(
    rows,
    EQUIPMENT_FIRST_PAGE_ROW_LIMIT,
    EQUIPMENT_CONTINUATION_PAGE_ROW_LIMIT,
  );
}

export function getEquipmentProposalPageCount(quote: QuoteRecord) {
  const contentPresence = getQuoteContentPresence(quote);

  if (!quote.sections.sectionB.enabled || !contentPresence.hasSectionBContent) {
    return 0;
  }

  return chunkEquipmentRowsForProposalPages(getIncludedEquipmentRows(quote)).length;
}

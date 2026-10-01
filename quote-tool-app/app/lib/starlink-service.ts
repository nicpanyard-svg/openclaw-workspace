import { applyMajorProjectToQuote } from "./major-project";
import type { QuoteRecord } from "./quote-record";

/** Service setup follows included subscription lines, never saved answers or hardware alone. */
export function hasStarlinkService(source: QuoteRecord): boolean {
  const major = source.metadata.workflowMode === "major_project" && source.majorProject?.enabled;
  const quote = major ? applyMajorProjectToQuote(source) : source;
  const section = quote.sections.sectionA;
  if (!section.enabled) return false;
  const rows = (section.mode === "pool" ? section.poolRows : section.perKitRows).filter(row => !row.optional);
  if (!rows.length) return false;
  if (!major) return true;
  return quote.majorProject.commercial.serviceMix !== "managed-network"
    || rows.some(row => /\bstarlink\b/i.test(row.description));
}

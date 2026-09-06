import type { MajorProjectOption, QuoteRecord } from "./quote-record";

export const AXIS_LOCAL_STORAGE_LABEL = "1 TB microSDXC Local Video Storage \u2014 Axis Camera";

export function cleanQuoteItemWording(value: string) {
  return value
    .replace(/\bIP[ \t]+67\b/gi, "IP67")
    .replace(/\bSecflow-1p\b/gi, "SecFlow-1p")
    .replace(/\bpoll[ \t]+mount\b/gi, "pole mount")
    .replace(/\b1[ \t]+TB[ \t]+SD[ \t]+Memory[ \t]+Card\b/gi, AXIS_LOCAL_STORAGE_LABEL);
}

// Only copy fields are corrected. IDs, source imports, filenames, and URLs stay intact.
function cleanFields<T extends object>(row: T, keys: Array<keyof T>): T {
  const next = { ...row };
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string") next[key] = cleanQuoteItemWording(value) as T[typeof key];
  }
  return next;
}

function cleanSections(sections: QuoteRecord["sections"]): QuoteRecord["sections"] {
  const recurringRow = <T extends { description: string; includedText?: string[] }>(row: T): T => ({
    ...cleanFields(row, ["description"]),
    ...(row.includedText ? { includedText: row.includedText.map(cleanQuoteItemWording) } : {}),
  });
  return {
    ...sections,
    sectionA: { ...sections.sectionA, poolRows: sections.sectionA.poolRows.map(recurringRow), perKitRows: sections.sectionA.perKitRows.map(recurringRow) },
    sectionB: { ...sections.sectionB, lineItems: sections.sectionB.lineItems.map((row) => cleanFields(row, ["itemName", "description"])) },
    sectionC: { ...sections.sectionC, lineItems: sections.sectionC.lineItems.map((row) => cleanFields(row, ["description", "notes"])) },
  };
}

function cleanOption(option: MajorProjectOption): MajorProjectOption {
  const next = { ...option };
  if (option.components) next.components = option.components.map((row) => cleanFields(row, ["internalName", "customerFacingLabel", "notes"]));
  if (option.simpleRows) next.simpleRows = option.simpleRows.map((row) => cleanFields(row, ["label", "description"]));
  if (option.bundles) next.bundles = option.bundles.map((row) => cleanFields(row, ["internalName", "customerFacingLabel", "description"]));
  if (option.customerQuoteLines) next.customerQuoteLines = option.customerQuoteLines.map((row) => cleanFields(row, ["label", "description"]));
  if (option.quickQuoteSource) next.quickQuoteSource = { ...option.quickQuoteSource, sections: cleanSections(option.quickQuoteSource.sections) };
  return next;
}

export function normalizeQuoteItemWording(quote: QuoteRecord): QuoteRecord {
  return {
    ...quote,
    sections: cleanSections(quote.sections),
    ...(quote.majorProject ? { majorProject: { ...quote.majorProject, options: quote.majorProject.options.map(cleanOption) } } : {}),
  };
}

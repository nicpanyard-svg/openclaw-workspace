import {
  ensureMajorProjectState,
  buildMajorProjectMetrics,
  getActiveMajorProjectOption,
  resolveMajorProjectOutputSpecAttachments,
  type MajorProjectOutputSpecAttachment,
} from "@/app/lib/major-project";
import type { MajorProjectOption, MajorProjectSpecAttachment, QuoteRecord } from "@/app/lib/quote-record";
import { isAnnualLine } from "./quote-line-billing";

export type ProposalAttachment = {
  id: `A${number}`;
  kind: "spec" | "drawing";
  attachment: MajorProjectSpecAttachment;
  itemLabels: string[];
  label: string;
};

function resolveItemAssociations(quote: QuoteRecord): MajorProjectOutputSpecAttachment[] {
  const option = getActiveMajorProjectOption(quote);
  if (!option) return [];

  const resolveOption = (projectOption: MajorProjectOption) => resolveMajorProjectOutputSpecAttachments({
    ...quote,
    majorProject: {
      ...quote.majorProject,
      options: [projectOption],
      activeOptionId: projectOption.id,
    },
  });

  // The resolver deduplicates globally. Resolve each output item independently
  // to retain shared-file labels without changing its source/association rules.
  if (option.customerQuoteLines?.length) {
    const resolvedLines = buildMajorProjectMetrics(quote).customerQuoteLines;
    const firstRecurring = resolvedLines.find((line) => line.presentationCategory === "recurring");
    return option.customerQuoteLines.flatMap((line) => {
      if (resolvedLines.find((resolved) => resolved.id === line.id)?.presentationCategory === "recurring" && line.id !== firstRecurring?.id) return [];
      return resolveOption({ ...option, customerQuoteLines: [line] });
    });
  }

  const components = option.components ?? [];
  if (components.length && !option.bundles?.length) {
    return components.flatMap((component, index) => {
      if (!component.specSheetAttachment) return [];
      return resolveOption({
        ...option,
        components: components.map((candidate, candidateIndex) => ({
          ...candidate,
          specSheetAttachment: candidateIndex === index ? candidate.specSheetAttachment : undefined,
        })),
      });
    });
  }

  return resolveMajorProjectOutputSpecAttachments(quote);
}

export function getProposalAttachments(quote: QuoteRecord): ProposalAttachment[] {
  const normalized = ensureMajorProjectState(quote);
  const sections = ["sectionA", "sectionB", "sectionC"] as const;
  const sectionA = quote.sections.sectionA;
  const rows = {
    sectionA: sectionA.mode === "pool" ? sectionA.poolRows : sectionA.perKitRows,
    sectionB: quote.sections.sectionB.lineItems,
    sectionC: quote.sections.sectionC.lineItems,
  };
  const rowOrder = Object.fromEntries(sections.map((section) => [
    section,
    new Map(rows[section].map((row, index) => [row.id, index])),
  ])) as Record<typeof sections[number], Map<string, number>>;
  const optionalRows = Object.fromEntries(sections.map((section) => [
    section, new Set(rows[section].filter((row) => row.optional).map((row) => row.id)),
  ])) as Record<typeof sections[number], Set<string>>;
  const specs = resolveItemAssociations(normalized)
    .filter((entry) => quote.sections[entry.outputSection].enabled)
    .sort((left, right) => {
      const optionOrder = Number(optionalRows[left.outputSection].has(left.outputItemId)) - Number(optionalRows[right.outputSection].has(right.outputItemId));
      const annualOrder = Number(rows[left.outputSection].some((row) => row.id === left.outputItemId && isAnnualLine(row))) - Number(rows[right.outputSection].some((row) => row.id === right.outputItemId && isAnnualLine(row)));
      const sectionOrder = sections.indexOf(left.outputSection) - sections.indexOf(right.outputSection);
      return optionOrder || annualOrder || sectionOrder || (rowOrder[left.outputSection].get(left.outputItemId) ?? Number.MAX_SAFE_INTEGER)
        - (rowOrder[right.outputSection].get(right.outputItemId) ?? Number.MAX_SAFE_INTEGER);
    });

  const attachments: ProposalAttachment[] = [];
  const byStorageKey = new Map<string, ProposalAttachment>();
  const add = (attachment: MajorProjectSpecAttachment, kind: ProposalAttachment["kind"], itemLabel?: string) => {
    let entry = byStorageKey.get(attachment.storageKey);
    if (!entry) {
      entry = { id: `A${attachments.length + 1}`, kind, attachment, itemLabels: [], label: attachment.fileName };
      byStorageKey.set(attachment.storageKey, entry);
      attachments.push(entry);
    }
    if (itemLabel && !entry.itemLabels.includes(itemLabel)) entry.itemLabels.push(itemLabel);
  };

  // Optional items are still customer output: retain whichever specs the resolver assigns.
  specs.forEach((entry) => add(entry.attachment, "spec", entry.outputItemLabel));
  normalized.majorProject.summary.systemDrawings?.forEach((attachment) => add(attachment, "drawing"));
  return attachments;
}

import { PDFDocument } from "pdf-lib";
import { resolveMajorProjectOutputSpecAttachments } from "@/app/lib/major-project";
import { getMajorProjectSpecAttachmentFile, isMajorProjectSpecAttachmentPdf } from "@/app/lib/major-project-spec-attachments";
import { getQuoteContentPresence } from "@/app/lib/proposal-commercial-summary";
import type { QuoteRecord } from "@/app/lib/quote-record";

function buildPageRange(start: number, endExclusive: number) {
  return Array.from({ length: Math.max(endExclusive - start, 0) }, (_, index) => start + index);
}

function getSpecPlaceholderStartPageIndex(quote: QuoteRecord) {
  const contentPresence = getQuoteContentPresence(quote);

  return (
    3
    + (quote.sections.sectionA.enabled && contentPresence.hasSectionAContent ? 1 : 0)
    + (quote.sections.sectionB.enabled && contentPresence.hasSectionBContent ? 1 : 0)
    + (quote.sections.sectionC.enabled && contentPresence.hasSectionCContent ? 1 : 0)
  );
}

async function copyPagesIntoDocument(target: PDFDocument, source: PDFDocument, pageIndices: number[]) {
  if (!pageIndices.length) return;
  const pages = await target.copyPages(source, pageIndices);
  pages.forEach((page) => target.addPage(page));
}

export async function assembleFinalProposalPdf(basePdfBlob: Blob, quote: QuoteRecord) {
  const resolvedAttachments = resolveMajorProjectOutputSpecAttachments(quote);

  if (!resolvedAttachments.length) {
    return basePdfBlob;
  }

  const loadedAttachments = await Promise.all(
    resolvedAttachments.map(async (entry) => {
      if (!isMajorProjectSpecAttachmentPdf(entry.attachment.fileName, entry.attachment.mimeType)) {
        return null;
      }

      try {
        const fileBlob = await getMajorProjectSpecAttachmentFile(entry.attachment.storageKey);
        if (!fileBlob) {
          return null;
        }

        return {
          storageKey: entry.attachment.storageKey,
          blob: fileBlob,
        };
      } catch {
        return null;
      }
    }),
  );

  if (!loadedAttachments.some(Boolean)) {
    return basePdfBlob;
  }

  const basePdfBytes = await basePdfBlob.arrayBuffer();
  const baseDocument = await PDFDocument.load(basePdfBytes);
  const specPlaceholderStartPageIndex = getSpecPlaceholderStartPageIndex(quote);
  const specPlaceholderCount = resolvedAttachments.length;
  const basePageCount = baseDocument.getPageCount();

  if (basePageCount < specPlaceholderStartPageIndex + specPlaceholderCount) {
    return basePdfBlob;
  }

  const mergedDocument = await PDFDocument.create();

  await copyPagesIntoDocument(
    mergedDocument,
    baseDocument,
    buildPageRange(0, specPlaceholderStartPageIndex),
  );

  for (let index = 0; index < resolvedAttachments.length; index += 1) {
    const loadedAttachment = loadedAttachments[index];
    const placeholderPageIndex = specPlaceholderStartPageIndex + index;

    if (loadedAttachment) {
      try {
        const attachmentDocument = await PDFDocument.load(await loadedAttachment.blob.arrayBuffer());
        await copyPagesIntoDocument(
          mergedDocument,
          attachmentDocument,
          buildPageRange(0, attachmentDocument.getPageCount()),
        );
        continue;
      } catch {
        // Fall back to the HTML placeholder page when the attachment PDF cannot be parsed.
      }
    }

    await copyPagesIntoDocument(mergedDocument, baseDocument, [placeholderPageIndex]);
  }

  await copyPagesIntoDocument(
    mergedDocument,
    baseDocument,
    buildPageRange(specPlaceholderStartPageIndex + specPlaceholderCount, basePageCount),
  );

  const mergedBytes = await mergedDocument.save();
  const normalizedMergedBytes = new Uint8Array(mergedBytes.byteLength);
  normalizedMergedBytes.set(mergedBytes);

  return new Blob([normalizedMergedBytes], { type: "application/pdf" });
}

import { PDFDocument } from "pdf-lib";
import { resolveMajorProjectOutputSpecAttachments } from "@/app/lib/major-project";
import {
  getMajorProjectSpecAttachmentFile,
  isMajorProjectSpecAttachmentImage,
  isMajorProjectSpecAttachmentPdf,
} from "@/app/lib/major-project-spec-attachments";
import { getQuoteContentPresence } from "@/app/lib/proposal-commercial-summary";
import { getEquipmentProposalPageCount } from "@/app/lib/proposal-print-pagination";
import type { QuoteRecord } from "@/app/lib/quote-record";

type LoadedSpecAttachment = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  blob: Blob;
  kind: "pdf" | "image";
};

function buildPageRange(start: number, endExclusive: number) {
  return Array.from({ length: Math.max(endExclusive - start, 0) }, (_, index) => start + index);
}

function getSpecPlaceholderStartPageIndex(quote: QuoteRecord) {
  const contentPresence = getQuoteContentPresence(quote);
  const systemDrawingCount = quote.majorProject?.summary?.systemDrawings?.length ?? 0;
  const equipmentPageCount = getEquipmentProposalPageCount(quote);

  return (
    3
    + (quote.sections.sectionA.enabled && contentPresence.hasSectionAContent ? 1 : 0)
    + equipmentPageCount
    + (quote.sections.sectionC.enabled && contentPresence.hasSectionCContent ? 1 : 0)
    + (contentPresence.hasOptionCostsContent ? 1 : 0)
    + systemDrawingCount
  );
}

async function copyPagesIntoDocument(target: PDFDocument, source: PDFDocument, pageIndices: number[]) {
  if (!pageIndices.length) return;
  const pages = await target.copyPages(source, pageIndices);
  pages.forEach((page) => target.addPage(page));
}

function isJpegAttachment(fileName: string, mimeType: string) {
  const normalizedFileName = fileName.trim().toLowerCase();
  const normalizedMimeType = mimeType.trim().toLowerCase();
  return normalizedMimeType === "image/jpeg" || normalizedFileName.endsWith(".jpg") || normalizedFileName.endsWith(".jpeg");
}

function isPngAttachment(fileName: string, mimeType: string) {
  const normalizedFileName = fileName.trim().toLowerCase();
  const normalizedMimeType = mimeType.trim().toLowerCase();
  return normalizedMimeType === "image/png" || normalizedFileName.endsWith(".png");
}

async function copyImageIntoDocument(target: PDFDocument, attachment: LoadedSpecAttachment) {
  const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
  const embeddedImage = isJpegAttachment(attachment.fileName, attachment.mimeType)
    ? await target.embedJpg(bytes)
    : isPngAttachment(attachment.fileName, attachment.mimeType)
      ? await target.embedPng(bytes)
      : null;

  if (!embeddedImage) return false;

  const page = target.addPage([612, 792]);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const margin = 36;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const scale = Math.min(availableWidth / embeddedImage.width, availableHeight / embeddedImage.height);
  const imageWidth = embeddedImage.width * scale;
  const imageHeight = embeddedImage.height * scale;

  page.drawImage(embeddedImage, {
    x: (pageWidth - imageWidth) / 2,
    y: (pageHeight - imageHeight) / 2,
    width: imageWidth,
    height: imageHeight,
  });

  return true;
}

export async function assembleFinalProposalPdf(basePdfBlob: Blob, quote: QuoteRecord) {
  const resolvedAttachments = resolveMajorProjectOutputSpecAttachments(quote);

  if (!resolvedAttachments.length) {
    return basePdfBlob;
  }

  const loadedAttachments = await Promise.all(
    resolvedAttachments.map(async (entry) => {
      const isPdfAttachment = isMajorProjectSpecAttachmentPdf(entry.attachment.fileName, entry.attachment.mimeType);
      const isImageAttachment = isMajorProjectSpecAttachmentImage(entry.attachment.fileName, entry.attachment.mimeType);

      if (!isPdfAttachment && !isImageAttachment) {
        return null;
      }

      try {
        const fileBlob = await getMajorProjectSpecAttachmentFile(entry.attachment.storageKey);
        if (!fileBlob) {
          return null;
        }

        return {
          storageKey: entry.attachment.storageKey,
          fileName: entry.attachment.fileName,
          mimeType: entry.attachment.mimeType,
          blob: fileBlob,
          kind: isPdfAttachment ? "pdf" : "image",
        } satisfies LoadedSpecAttachment;
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

    await copyPagesIntoDocument(mergedDocument, baseDocument, [placeholderPageIndex]);

    if (loadedAttachment?.kind === "pdf") {
      try {
        const attachmentDocument = await PDFDocument.load(await loadedAttachment.blob.arrayBuffer());
        await copyPagesIntoDocument(
          mergedDocument,
          attachmentDocument,
          buildPageRange(0, attachmentDocument.getPageCount()),
        );
      } catch {
        // The cover page has already been copied, so keep it as the export fallback.
      }
    }

    if (loadedAttachment?.kind === "image") {
      try {
        await copyImageIntoDocument(mergedDocument, loadedAttachment);
      } catch {
        // The cover page has already been copied, so keep it as the export fallback.
      }
    }
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

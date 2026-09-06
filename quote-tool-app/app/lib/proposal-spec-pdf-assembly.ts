import { degrees, PDFDict, PDFDocument, PDFFont, PDFName, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { getMajorProjectSpecAttachmentFile } from "@/app/lib/major-project-spec-attachments";
import { getProposalAttachments, type ProposalAttachment } from "@/app/lib/proposal-attachments";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { convertProposalImageToPng } from "@/app/lib/proposal-image-conversion";

export type ProposalAttachmentLoader = (storageKey: string) => Promise<Blob | undefined>;

export type ProposalPdfAssemblyOptions = {
  loadAttachment?: ProposalAttachmentLoader;
  convertImageToPng?: (image: Blob) => Promise<Blob>;
  proposalId?: string;
};

export type ProposalAttachmentFailure = {
  id: ProposalAttachment["id"];
  fileName: string;
  reason: string;
};

export class ProposalPdfAssemblyError extends Error {
  constructor(public readonly failures: ProposalAttachmentFailure[]) {
    super("Cannot export proposal PDF. Resolve these attachments:\n" + failures.map((failure) => `${failure.id} - ${failure.fileName}: ${failure.reason}`).join("\n"));
    this.name = "ProposalPdfAssemblyError";
  }
}

// Base HTML must reserve at least 36pt below its content for final numbering.
export const PROPOSAL_PDF_FOOTER_MARGIN = 36;
const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const SIDE_MARGIN = 36;
const CONTENT_BOTTOM = 48;
const CONTENT_TOP = 744;
const INK = rgb(0.25, 0.29, 0.32);

function fitText(text: string, font: PDFFont, size: number, width: number): string {
  const characters = new Set(font.getCharacterSet());
  let fitted = Array.from(text.replace(/\s+/g, " "), (character) => characters.has(character.codePointAt(0)!) ? character : "?").join("");
  if (font.widthOfTextAtSize(fitted, size) <= width) return fitted;
  while (fitted && font.widthOfTextAtSize(fitted + "...", size) > width) fitted = fitted.slice(0, -1);
  return fitted ? fitted + "..." : "";
}

function attachmentHeader(page: PDFPage, entry: ProposalAttachment, font: PDFFont, pageNumber: number, pageCount: number) {
  const continuation = `${pageNumber}/${pageCount}`;
  const continuationWidth = font.widthOfTextAtSize(continuation, 9);
  const title = `${entry.id} - ${entry.kind === "spec" ? "Specification" : "System drawing"} - ${entry.label}`;
  page.drawText(fitText(title, font, 10, LETTER_WIDTH - SIDE_MARGIN * 2 - continuationWidth - 16), {
    x: SIDE_MARGIN, y: 765, font, size: 10, color: INK,
  });
  page.drawText(continuation, { x: LETTER_WIDTH - SIDE_MARGIN - continuationWidth, y: 765, font, size: 9, color: INK });
}

function sourceRotation(page: PDFPage) {
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  if (![0, 90, 180, 270].includes(rotation)) throw new Error("unsupported PDF page rotation");
  return rotation;
}

async function appendPdf(target: PDFDocument, blob: Blob, entry: ProposalAttachment, font: PDFFont) {
  const source = await PDFDocument.load(await blob.arrayBuffer(), { throwOnInvalidObject: true });
  if (!source.getPageCount()) throw new Error("PDF has no pages");

  for (const [index, sourcePage] of source.getPages().entries()) {
    const annotations = sourcePage.node.Annots();
    for (let annotationIndex = 0; annotationIndex < (annotations?.size() ?? 0); annotationIndex += 1) {
      const annotation = source.context.lookup(annotations!.get(annotationIndex));
      // Form embedding preserves page artwork, not annotation appearances.
      // Reject these explicitly rather than silently dropping stamps or form values.
      if (!(annotation instanceof PDFDict && annotation.get(PDFName.of("Subtype")) === PDFName.of("Link"))) {
        throw new Error("unsupported PDF annotations; export a flattened PDF before attaching");
      }
    }
    const { x, y, width, height } = sourcePage.getMediaBox();
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new Error("invalid PDF page dimensions");
    const rotation = sourceRotation(sourcePage);
    const sideways = rotation === 90 || rotation === 270;
    const scale = Math.min((LETTER_WIDTH - SIDE_MARGIN * 2) / (sideways ? height : width), (CONTENT_TOP - CONTENT_BOTTOM) / (sideways ? width : height));
    const displayWidth = (sideways ? height : width) * scale;
    const displayHeight = (sideways ? width : height) * scale;
    const left = (LETTER_WIDTH - displayWidth) / 2;
    const bottom = CONTENT_BOTTOM + (CONTENT_TOP - CONTENT_BOTTOM - displayHeight) / 2;
    sourcePage.pushOperators(); // Materialize a contents stream for valid blank pages.
    const embedded = await target.embedPage(sourcePage, { left: x, bottom: y, right: x + width, top: y + height });
    await embedded.embed(); // Surface corrupt content streams before final save.
    const page = target.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    page.drawPage(embedded, {
      x: left + (rotation === 180 ? width * scale : rotation === 270 ? height * scale : 0),
      y: bottom + (rotation === 90 ? width * scale : rotation === 180 ? height * scale : 0),
      width: width * scale,
      height: height * scale,
      rotate: degrees(-rotation),
    });
    attachmentHeader(page, entry, font, index + 1, source.getPageCount());
  }
}

async function appendImage(target: PDFDocument, bytes: Uint8Array, format: "png" | "jpeg", entry: ProposalAttachment, font: PDFFont) {
  const embedded = format === "png" ? await target.embedPng(bytes) : await target.embedJpg(bytes);
  await embedded.embed();
  if (embedded.width <= 0 || embedded.height <= 0) throw new Error("invalid image dimensions");
  const scale = Math.min((LETTER_WIDTH - SIDE_MARGIN * 2) / embedded.width, (CONTENT_TOP - CONTENT_BOTTOM) / embedded.height);
  const page = target.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  page.drawImage(embedded, {
    x: (LETTER_WIDTH - embedded.width * scale) / 2,
    y: CONTENT_BOTTOM + (CONTENT_TOP - CONTENT_BOTTOM - embedded.height * scale) / 2,
    width: embedded.width * scale,
    height: embedded.height * scale,
  });
  attachmentHeader(page, entry, font, 1, 1);
}

function attachmentFormat(entry: ProposalAttachment, blob: Blob): "pdf" | "png" | "jpeg" | "webp" | "gif" | undefined {
  const mime = (entry.attachment.mimeType || blob.type).toLowerCase().split(";")[0].trim();
  const name = entry.attachment.fileName.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime === "image/png" || name.endsWith(".png")) return "png";
  if (mime === "image/jpeg" || /\.jpe?g$/.test(name)) return "jpeg";
  if (mime === "image/webp" || name.endsWith(".webp")) return "webp";
  if (mime === "image/gif" || name.endsWith(".gif")) return "gif";
  return undefined;
}

function stampPageNumbers(document: PDFDocument, font: PDFFont, proposalId?: string) {
  const pageCount = document.getPageCount();
  document.getPages().forEach((page, index) => {
    const box = page.getCropBox();
    const rotation = sourceRotation(page);
    const displayWidth = rotation === 90 || rotation === 270 ? box.height : box.width;
    const drawFooter = (text: string, left: number) => {
      const bottom = 18;
      const point = rotation === 90 ? { x: box.x + box.width - bottom, y: box.y + left }
        : rotation === 180 ? { x: box.x + box.width - left, y: box.y + box.height - bottom }
          : rotation === 270 ? { x: box.x + bottom, y: box.y + box.height - left }
            : { x: box.x + left, y: box.y + bottom };
      page.drawText(text, { ...point, font, size: 9, rotate: degrees(rotation), color: INK });
    };
    const number = `Page ${index + 1} of ${pageCount}`;
    const numberWidth = font.widthOfTextAtSize(number, 9);
    drawFooter(number, displayWidth - SIDE_MARGIN - numberWidth);
    if (proposalId) drawFooter(fitText(proposalId, font, 9, displayWidth - SIDE_MARGIN * 2 - numberWidth - 24), SIDE_MARGIN);
  });
}

export async function assembleFinalProposalPdf(
  basePdfBlob: Blob,
  quote: QuoteRecord,
  options: ProposalPdfAssemblyOptions = {},
): Promise<Blob> {
  const entries = getProposalAttachments(quote);
  const loadAttachment = options.loadAttachment ?? getMajorProjectSpecAttachmentFile;
  const loaded = await Promise.allSettled(entries.map(async (entry) => loadAttachment(entry.attachment.storageKey)));
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(await basePdfBlob.arrayBuffer(), { throwOnInvalidObject: true });
    if (!document.getPageCount()) throw new Error("PDF has no pages");
  } catch {
    throw new Error("Cannot export proposal PDF: the commercial/base PDF is corrupt or unreadable.");
  }
  const font = await document.embedFont(StandardFonts.Helvetica);
  const failures: ProposalAttachmentFailure[] = [];
  for (const [index, entry] of entries.entries()) {
    const result = loaded[index];
    let reason: string | undefined;
    if (result.status === "rejected") reason = "file could not be loaded; reattach it and retry";
    else if (!result.value) reason = "missing file; reattach it and retry";
    else {
      const format = attachmentFormat(entry, result.value);
      if (!format) reason = "unsupported file format; attach PDF, PNG, JPEG, WebP, or GIF";
      else {
        try {
          if (format === "pdf") await appendPdf(document, result.value, entry, font);
          else if (format === "webp" || format === "gif") {
            const png = await (options.convertImageToPng ?? convertProposalImageToPng)(result.value);
            await appendImage(document, new Uint8Array(await png.arrayBuffer()), "png", entry, font);
          }
          else await appendImage(document, new Uint8Array(await result.value.arrayBuffer()), format, entry, font);
        } catch (error) {
          reason = error instanceof Error && /^(unsupported|image conversion)/.test(error.message) ? error.message : "corrupt or unreadable file; replace it and retry";
        }
      }
    }
    if (reason) failures.push({ id: entry.id, fileName: entry.attachment.fileName, reason });
  }
  if (failures.length) throw new ProposalPdfAssemblyError(failures);
  stampPageNumbers(document, font, options.proposalId);
  const bytes = await document.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

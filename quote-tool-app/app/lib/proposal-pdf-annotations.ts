import type { PDFDocumentProxy } from "pdfjs-dist";

export async function loadAnnotatedPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
}

/** Flatten visible annotations into an export-only image; keep the uploaded PDF intact. */
export async function renderAnnotatedPage(document: PDFDocumentProxy, pageNumber: number): Promise<Uint8Array> {
  const page = await document.getPage(pageNumber);
  const canvas = globalThis.document.createElement("canvas");
  try {
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(3, 3600 / Math.max(natural.width, natural.height), Math.sqrt(8_000_000 / (natural.width * natural.height)));
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // PDF.js renders visible annotation appearances and form values by default.
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("PDF annotation rendering failed")), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    page.cleanup();
    canvas.width = 1;
    canvas.height = 1;
  }
}

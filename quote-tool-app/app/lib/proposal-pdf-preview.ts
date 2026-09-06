import type { PDFDocumentProxy } from "pdfjs-dist";

export type ProposalPreviewPage = {
  blob: Blob;
  width: number;
  height: number;
  pageNumber: number;
  pageCount: number;
};

// Render sequentially and release each canvas so long spec sheets stay bounded.
export async function renderProposalPdfPreview(
  document: PDFDocumentProxy,
  signal: AbortSignal,
  onPage: (page: ProposalPreviewPage) => void,
) {
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    signal.throwIfAborted();
    const page = await document.getPage(pageNumber);
    signal.throwIfAborted();
    const natural = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2400 / Math.max(natural.width, natural.height), Math.sqrt(2_000_000 / (natural.width * natural.height)));
    const viewport = page.getViewport({ scale });
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const render = page.render({ canvas, viewport });
    const cancel = () => render.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await render.promise;
      signal.throwIfAborted();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((image) => image ? resolve(image) : reject(new Error("Could not render the spec sheet page.")), "image/png");
      });
      signal.throwIfAborted();
      onPage({ blob, width: canvas.width, height: canvas.height, pageNumber, pageCount: document.numPages });
    } finally {
      signal.removeEventListener("abort", cancel);
      page.cleanup();
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import type { ProposalAttachment } from "@/app/lib/proposal-attachments";
import { getMajorProjectSpecAttachmentFile, isMajorProjectSpecAttachmentPdf } from "@/app/lib/major-project-spec-attachments";
import { renderProposalPdfPreview, type ProposalPreviewPage } from "@/app/lib/proposal-pdf-preview";

type Props = {
  entry: ProposalAttachment;
  loadAttachment?: typeof getMajorProjectSpecAttachmentFile;
};
type VisiblePage = Omit<ProposalPreviewPage, "blob"> & { url: string };

export function ProposalAttachmentPreview(props: Props) {
  const attachment = props.entry.attachment;
  return <AttachmentPages key={`${attachment.storageKey}:${attachment.updatedAt}:${attachment.fileName}:${attachment.mimeType}`} {...props} />;
}

function AttachmentPages({ entry, loadAttachment = getMajorProjectSpecAttachmentFile }: Props) {
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [pages, setPages] = useState<VisiblePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const attachment = entry.attachment;
  const isPdf = isMajorProjectSpecAttachmentPdf(attachment.fileName, attachment.mimeType);

  useEffect(() => {
    // The export assembler appends original files after the printed schedules.
    if (window.matchMedia("print").matches) return;
    const controller = new AbortController();
    const urls: string[] = [];
    let task: PDFDocumentLoadingTask | undefined;
    const destroyTask = async () => {
      const current = task;
      task = undefined;
      await current?.destroy();
    };
    const createUrl = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      return url;
    };
    async function load() {
      try {
        const blob = await loadAttachment(attachment.storageKey);
        controller.signal.throwIfAborted();
        if (!blob) throw new Error("The assigned file is unavailable. Reattach it to the quoted item before downloading the proposal.");
        setSourceUrl(createUrl(blob));
        if (isPdf) {
          const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
          controller.signal.throwIfAborted();
          pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
          const data = new Uint8Array(await blob.arrayBuffer());
          controller.signal.throwIfAborted();
          task = pdfjs.getDocument({ data, useSystemFonts: true });
          const pdf = await task.promise;
          await renderProposalPdfPreview(pdf, controller.signal, (page) => {
            const { blob: image, ...dimensions } = page;
            const visible = { ...dimensions, url: createUrl(image) };
            setPages((current) => [...current, visible]);
          });
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "This attachment could not be displayed.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
        await destroyTask();
      }
    }
    void load();
    return () => {
      controller.abort();
      void destroyTask();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [attachment.storageKey, isPdf, loadAttachment]);

  return <section className="cp-attachment-preview no-print" aria-label={`${entry.id} ${entry.label}`} aria-busy={loading}>
    <header className="cp-attachment-heading">
      <div><h3>{entry.id} / {entry.label}</h3><p>{entry.itemLabels.join("; ")}</p></div>
      {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title="Open original document" aria-label={`Open original document: ${entry.label}`}><ExternalLink size={18} aria-hidden="true" /></a>}
    </header>
    {isPdf ? pages.map((page) => <figure className="cp-spec-page" key={page.pageNumber}>
      <img src={page.url} width={page.width} height={page.height} alt={`${entry.label}, page ${page.pageNumber} of ${page.pageCount}`} loading="lazy" decoding="async" />
      <figcaption>{entry.id} / Page {page.pageNumber} of {page.pageCount}</figcaption>
    </figure>) : sourceUrl && <figure className="cp-spec-page"><img src={sourceUrl} alt={entry.label} onError={() => setError("This image could not be displayed. Reattach a readable PDF or image to the quoted item.")} /></figure>}
    {loading && <p className="cp-muted" role="status">Loading {entry.label}...</p>}
    {error && <p role="alert">{entry.label}: {error}</p>}
  </section>;
}

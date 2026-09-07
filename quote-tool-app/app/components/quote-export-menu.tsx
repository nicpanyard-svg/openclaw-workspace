"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ClipboardList, Download, FileSpreadsheet, FileText, LoaderCircle } from "lucide-react";
import type { QuoteRecord } from "../lib/quote-record";
import { QuoteMasterExport } from "./quote-master-export";
import "./quote-export.css";

type Props = {
  quote: QuoteRecord;
  disabled?: boolean;
  pdfDisabled?: boolean;
  downloading?: boolean;
  onPdf: () => void | Promise<void>;
  onOrderSummary?: () => void;
  getQuote?: () => QuoteRecord | null | undefined;
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function QuoteExportMenu({ quote, disabled, pdfDisabled, downloading, onPdf, onOrderSummary, getQuote }: Props) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const run = async (kind: "approval" | "order") => {
    if (busy || disabled) return;
    setBusy(true); setError("");
    try {
      if (kind === "order" && onOrderSummary) {
        onOrderSummary();
        setOpen(false); trigger.current?.focus();
        return;
      }
      const source = getQuote ? getQuote() : quote;
      if (!source) throw new Error("Complete the customer details before exporting.");
      if (kind === "approval") {
        const { buildProposalApprovalWorkbook } = await import("../lib/proposal-xlsx-export");
        const result = await buildProposalApprovalWorkbook(source);
        downloadBlob(result.blob, result.fileName);
      } else {
        const { buildOrderProcessingText } = await import("../lib/order-processing");
        const name = [source.customer.name, source.metadata.documentTitle, source.metadata.proposalNumber, "Order Summary"].filter(Boolean).join(" - ").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 210);
        downloadBlob(new Blob([buildOrderProcessingText(source)], { type: "text/plain;charset=utf-8" }), `${name}.txt`);
      }
      setOpen(false); trigger.current?.focus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed. Please try again."); }
    finally { setBusy(false); }
  };
  return <div ref={ref} className="qe-menu" onBlur={(event) => { if (!busy && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="qe-button qe-primary" aria-expanded={open} aria-controls={id} disabled={disabled || busy || downloading} onClick={() => setOpen(!open)}>{busy || downloading ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {busy || downloading ? "Exporting..." : "Export"}<ChevronDown size={15} /></button>
    <div id={id} className="qe-popover" hidden={!open} aria-label="Quote export options">
      <span className="qe-group-label">Customer-facing</span>
      <button type="button" disabled={disabled || pdfDisabled || downloading || busy} onClick={() => { setOpen(false); void onPdf(); }}><FileText size={17} />Customer Proposal PDF</button>
      <span className="qe-group-label">Internal only</span>
      <button type="button" disabled={busy} onClick={() => void run("approval")}><FileSpreadsheet size={17} />Internal Approval Workbook</button>
      {quote.metadata.workflowMode === "major_project" && <QuoteMasterExport quote={quote} onClosed={() => window.setTimeout(() => trigger.current?.focus(), 0)} renderTrigger={(start) => <button type="button" disabled={busy} onClick={() => { setOpen(false); start(); }}><FileSpreadsheet size={17} />Hector&apos;s Quote Master</button>} />}
      <button type="button" disabled={busy} onClick={() => void run("order")}><ClipboardList size={17} />Order-Processing Summary</button>
      {error && <p className="qe-error" role="alert">{error}</p>}
    </div>
  </div>;
}

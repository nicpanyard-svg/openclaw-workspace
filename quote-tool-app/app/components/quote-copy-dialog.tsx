"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Copy, LoaderCircle, X } from "lucide-react";
import type { QuoteRecord } from "../lib/quote-record";
import { getQuoteCopyScopeItems, getQuoteCopySupportingAttachments, getQuoteCopyTerms, type QuoteCopyReviewOptions } from "../lib/quote-copy-review";
import "./quote-copy-dialog.css";

export type QuoteCopyDialogProps = {
  quote: QuoteRecord;
  onCancel: () => void;
  /** Resolve after a verified save; reject to keep the review open with an error. */
  onConfirm: (options: QuoteCopyReviewOptions) => void | Promise<void>;
};

export function QuoteCopyDialog({ quote, onCancel, onConfirm }: QuoteCopyDialogProps) {
  const [source] = useState(() => structuredClone(quote));
  const items = useMemo(() => getQuoteCopyScopeItems(source), [source]);
  const termsText = useMemo(() => getQuoteCopyTerms(source), [source]);
  const supportingFiles = useMemo(() => getQuoteCopySupportingAttachments(source), [source]);
  const [kept, setKept] = useState(() => items.map((item) => item.key));
  const [customerMode, setCustomerMode] = useState<QuoteCopyReviewOptions["customerMode"]>(source.customer.name.trim() ? "same" : "different");
  const [terms, setTerms] = useState<"" | QuoteCopyReviewOptions["terms"]>("");
  const [attachments, setAttachments] = useState<"" | QuoteCopyReviewOptions["attachments"]>("");
  const [supportingAttachments, setSupportingAttachments] = useState<"" | QuoteCopyReviewOptions["supportingAttachments"]>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const groups = [...new Set(items.map((item) => item.group))];
  const selected = items.filter((item) => kept.includes(item.key));
  const specCount = new Set(selected.flatMap((item) => item.specs)).size;
  const toggle = (keys: string[], keep: boolean) => setKept((current) => keep ? [...new Set([...current, ...keys])] : current.filter((item) => !keys.includes(item)));
  const confirm = async () => {
    if (inFlight.current || !terms || !attachments || !supportingAttachments) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try { await onConfirm({ customerMode, keptScopeKeys: kept, terms, attachments, supportingAttachments }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save this copy. Your original quote is unchanged."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <dialog ref={dialog} className="qcopy-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-source`} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
    <form onSubmit={(event) => { event.preventDefault(); void confirm(); }} aria-busy={busy}>
      <header className="qcopy-header">
        <div><h2 id={`${id}-title`}>Copy quote</h2><p id={`${id}-source`}>{source.metadata.proposalNumber} / {source.customer.name || "No customer"}</p><p>{source.metadata.documentTitle || "Untitled quote"}</p></div>
        <button type="button" className="qcopy-icon" title="Close copy review" aria-label="Close copy review" onClick={onCancel} disabled={busy} autoFocus><X size={20} /></button>
      </header>
      <div className="qcopy-body">
        <fieldset disabled={busy} className="qcopy-customer"><legend>Customer</legend>
          <label><input type="radio" name={`${id}-customer`} value="same" checked={customerMode === "same"} disabled={!source.customer.name.trim()} onChange={() => setCustomerMode("same")} />Same customer</label>
          <label><input type="radio" name={`${id}-customer`} value="different" checked={customerMode === "different"} onChange={() => setCustomerMode("different")} />Different customer</label>
        </fieldset>
        {customerMode === "different" && <p className="qcopy-warning">Customer, contacts, addresses, saved profile links, SLA, order details, tax, CRM links, and customer-specific notes will be cleared. Selected items, quantities, and prices stay. Supplier imports and signed agreements will not carry over.</p>}
        <fieldset disabled={busy} className="qcopy-scope"><legend>Equipment and services</legend>
          <div className="qcopy-scope-tools"><span>{kept.length} of {items.length} selected</span><button type="button" onClick={() => setKept(items.map((item) => item.key))}>Keep all</button><button type="button" onClick={() => setKept([])}>Remove all</button></div>
          {!items.length && <p>No line items in this source.</p>}
          {groups.map((group) => {
            const rows = items.filter((item) => item.group === group);
            const count = rows.filter((item) => kept.includes(item.key)).length;
            return <details className="qcopy-group" key={group} open>
              <summary>{group}<span>{count}/{rows.length}</span></summary>
              <div className="qcopy-group-tools"><button type="button" onClick={() => toggle(rows.map((row) => row.key), true)}>Keep group</button><button type="button" onClick={() => toggle(rows.map((row) => row.key), false)}>Remove group</button></div>
              {rows.map((item) => <label className="qcopy-item" key={item.key}>
                <input type="checkbox" checked={kept.includes(item.key)} onChange={(event) => toggle([item.key], event.target.checked)} />
                <span><strong>{item.label || "Unnamed item"}</strong><small>{item.detail}</small>{item.specs.length > 0 && <small className="qcopy-specs">Specs: {item.specs.join(", ")}</small>}</span>
              </label>)}
            </details>;
          })}
        </fieldset>
        {!selected.length && <p className="qcopy-warning" role="status">No scope selected. The copy will be an empty draft.</p>}
        {selected.length < items.length && <p className="qcopy-warning">Linked specs leave with removed items. Specs on changed packages are cleared. Order confirmations must be reviewed again.{source.metadata.workflowMode !== "major_project" ? " Aggregate internal costs will be reset because they are not linked to individual items." : ""}</p>}
        <fieldset className="qcopy-retention" disabled={busy}><legend>Terms and attachments</legend>
          <label>Terms and commercial notes ({termsText.length})<select value={terms} onChange={(event) => setTerms(event.target.value as typeof terms)} required><option value="">Choose...</option><option value="remove">Remove source terms</option><option value="keep">Keep reviewed terms</option></select></label>
          {termsText.length > 0 && <details className="qcopy-review-text"><summary>Review source terms</summary><ul>{termsText.map((term, index) => <li key={index}>{term}</li>)}</ul></details>}
          {terms === "keep" && <p className="qcopy-warning">Retained terms are not automatically matched to the selected scope. Check any satellite, subscription, and service commitments.{customerMode === "different" ? " Terms naming the old customer, SLA, warranty notes, payment arrangements, and confirmations will still be cleared." : ""}</p>}
          <label>Line-item specs ({specCount})<select value={attachments} onChange={(event) => setAttachments(event.target.value as typeof attachments)} required><option value="">Choose...</option><option value="keep">Keep specs for selected items</option><option value="remove">Remove all line-item specs</option></select></label>
          <label>Supporting files ({supportingFiles.length})<select value={supportingAttachments} onChange={(event) => setSupportingAttachments(event.target.value as typeof supportingAttachments)} required><option value="">Choose...</option><option value="remove">Remove supporting files</option><option value="keep">{customerMode === "different" ? "Keep reviewed drawings only" : "Keep reviewed supporting files"}</option></select></label>
          {supportingFiles.length > 0 && <details className="qcopy-review-text"><summary>Review supporting files</summary><ul>{supportingFiles.map((file) => <li key={file}>{file}</li>)}</ul></details>}
        </fieldset>
        {error && <p className="qcopy-error" role="alert">{error}</p>}
      </div>
      <footer className="qcopy-footer"><span aria-live="polite">{selected.filter((item) => item.kind === "equipment").length} equipment / {selected.filter((item) => item.kind === "services").length} services<br /><small>New quote number / Draft / Original unchanged</small></span><div><button type="button" className="qcopy-button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="qcopy-button qcopy-primary" disabled={busy || !terms || !attachments || !supportingAttachments}>{busy ? <LoaderCircle size={17} className="qcopy-spinner" /> : <Copy size={17} />}{busy ? "Saving copy..." : "Create copy"}</button></div></footer>
    </form>
  </dialog>;
}

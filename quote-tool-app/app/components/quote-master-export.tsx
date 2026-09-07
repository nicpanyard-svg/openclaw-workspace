"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, LoaderCircle, X } from "lucide-react";
import { ensureMajorProjectState } from "../lib/major-project";
import { PROPOSAL_STORE_KEY, deserializeProposalStore } from "../lib/proposal-store";
import { buildQuoteMasterColumns, canSplitQuoteMasterConnectivity, QUOTE_MASTER_TEMPLATE_NOTICE, type QuoteMasterSelection } from "../lib/quote-master-model";
import type { QuoteRecord } from "../lib/quote-record";
import "./quote-export.css";

type Choice = QuoteMasterSelection & { key: string; title: string; canSplit: boolean };
const saraIds = ["RCT-1788621320967", "RCT-1788628213855", "RCT-1788644603859", "RCT-1788656996974"];
const idsFor = (quote: QuoteRecord) => [quote.metadata.proposalNumber, quote.internal.savedProposalId, quote.internal.quoteId];

type Props = {
  quote: QuoteRecord;
  className?: string;
  selectedQuotes?: QuoteRecord[];
  label?: string;
  disabled?: boolean;
  renderTrigger?: (start: () => void) => ReactNode;
  onClosed?: () => void;
};

export function QuoteMasterExport({ quote, className = "proposal-secondary-button", selectedQuotes, label = "Quote Master Workbook", disabled, renderTrigger, onClosed }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [splits, setSplits] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const restoreFocus = () => window.setTimeout(() => { if (onClosed) onClosed(); else returnFocus.current?.focus(); }, 0);
  const close = () => { if (busy) return; setOpen(false); restoreFocus(); };
  const start = () => {
    if (disabled) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const store = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
      const customer = quote.customer.name.trim().toLowerCase();
      const others = (store?.proposals || []).filter((record) => record.quote.customer.name.trim().toLowerCase() === customer && !idsFor(record.quote).some((id) => id && idsFor(quote).includes(id)) && record.quote.metadata.workflowMode === "major_project");
      const quotes = (selectedQuotes ?? [quote, ...others.map((record) => record.quote)]).map((record) => ensureMajorProjectState(structuredClone(record)));
      if (!selectedQuotes) quotes.sort((a, b) => {
        const order = (q: QuoteRecord) => { const i = saraIds.findIndex((id) => idsFor(q).includes(id)); return i < 0 ? 99 : i; };
        return order(a) - order(b);
      });
      const next: Choice[] = quotes.flatMap((record, recordIndex) => record.majorProject.options.map((option) => {
        const choice = { quote: record, optionId: option.id, key: `${recordIndex}:${option.id}`, title: record.metadata.documentTitle || record.majorProject.summary.projectName || "Untitled quote" };
        return { ...choice, canSplit: canSplitQuoteMasterConnectivity(choice) };
      }));
      const inSara = saraIds.some((id) => idsFor(quote).includes(id));
      setChoices(next);
      setSelected(next.filter((choice) => choice.optionId === choice.quote.majorProject.activeOptionId && (selectedQuotes || (inSara ? saraIds.some((id) => idsFor(choice.quote).includes(id)) : idsFor(choice.quote).some((id) => id && idsFor(quote).includes(id))))).map((choice) => choice.key));
      setSplits(next.filter((choice) => choice.canSplit).map((choice) => choice.key));
      setError("");
    } catch (cause) {
      setChoices([]); setSelected([]); setSplits([]);
      setError(cause instanceof Error ? cause.message : "Unable to open saved quotes.");
    }
    setOpen(true);
  };
  const selections = choices.filter((choice) => selected.includes(choice.key)).map((choice) => ({ ...choice, splitConnectivity: splits.includes(choice.key) }));
  let columns: ReturnType<typeof buildQuoteMasterColumns> = [], validation = "";
  if (open) {
    try { columns = buildQuoteMasterColumns(selections); }
    catch (cause) { validation = cause instanceof Error ? cause.message : "Unable to map these options."; }
  }
  const download = async () => {
    if (busy || validation) return;
    setBusy(true);
    setError("");
    try {
      const { buildQuoteMasterWorkbook } = await import("../lib/quote-master-xlsx");
      const { blob, fileName } = await buildQuoteMasterWorkbook(selections);
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setOpen(false);
      restoreFocus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to export Quote Master workbook."); }
    finally { setBusy(false); }
  };
  return <>
    {renderTrigger ? renderTrigger(start) : <button type="button" className={`${className} qm-trigger`} disabled={disabled} onClick={start} title="Export internal Quote Master workbook with line-item costs and pricing"><FileSpreadsheet size={16} aria-hidden="true" />{label}</button>}
    {open && createPortal(<dialog ref={dialog} onCancel={(event) => { event.preventDefault(); close(); }} className="qm-dialog" aria-labelledby="quote-master-heading">
      <header className="qm-header">
        <div><h2 id="quote-master-heading">Quote Master Workbook</h2><p>{quote.customer.name} <span>Internal approval</span></p></div>
        <button type="button" aria-label="Close workbook export" title="Close" className="qe-icon" disabled={busy} onClick={close}><X size={18} /></button>
      </header>
      <div className="qm-body">
        <fieldset disabled={busy}>
          <legend>Selected quotes and project options</legend>
          <div className="qm-choices">
            {choices.map((choice) => <div key={choice.key} className="qm-choice">
              <label><input type="checkbox" checked={selected.includes(choice.key)} onChange={(event) => { setError(""); setSelected((current) => event.target.checked ? [...current, choice.key] : current.filter((key) => key !== choice.key)); }} /><span>{choice.title}<small>{choice.quote.metadata.proposalNumber} / {choice.quote.majorProject.options.find((option) => option.id === choice.optionId)?.label}</small></span></label>
              {selected.includes(choice.key) && choice.canSplit && <label className="qm-split"><input type="checkbox" checked={splits.includes(choice.key)} onChange={(event) => { setError(""); setSplits((current) => event.target.checked ? [...current, choice.key] : current.filter((key) => key !== choice.key)); }} />Separate cellular and Starlink alternatives</label>}
            </div>)}
          </div>
        </fieldset>
        <section className="qm-summary">
          <h3>Workbook columns ({columns.length}/5)</h3>
          {columns.length > 0 && <div className="qm-table-wrap"><table><thead><tr><th>Scope</th><th>One-time</th><th>Monthly</th><th>Annual renewal</th></tr></thead><tbody>{columns.map((column, i) => <tr key={i}><td>{column.label}</td>{[column.oneTime, column.monthly, column.annual].map((amount, j) => <td key={j} data-label={["One-time", "Monthly", "Annual renewal"][j]}>{amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>)}</tr>)}</tbody></table></div>}
          <p>{QUOTE_MASTER_TEMPLATE_NOTICE}</p>
          {(error || validation) && <p role="alert" className="qm-error">{error || validation}</p>}
        </section>
      </div>
      <footer className="qm-footer"><span>{selections.length} selected options</span><button type="button" className="qe-button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy || Boolean(validation)} onClick={() => void download()} className="qe-button qe-primary">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {busy ? "Exporting..." : "Download Workbook"}</button></footer>
    </dialog>, document.body)}
  </>;
}

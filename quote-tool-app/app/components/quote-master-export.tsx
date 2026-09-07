"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, X } from "lucide-react";
import { ensureMajorProjectState } from "../lib/major-project";
import { PROPOSAL_STORE_KEY, deserializeProposalStore } from "../lib/proposal-store";
import { buildQuoteMasterColumns, QUOTE_MASTER_TEMPLATE_NOTICE, type QuoteMasterSelection } from "../lib/quote-master-model";
import type { QuoteRecord } from "../lib/quote-record";

type Choice = QuoteMasterSelection & { key: string; title: string };
const saraIds = ["RCT-1788621320967", "RCT-1788628213855", "RCT-1788644603859", "RCT-1788656996974"];
const idsFor = (quote: QuoteRecord) => [quote.metadata.proposalNumber, quote.internal.savedProposalId, quote.internal.quoteId];

export function QuoteMasterExport({ quote, className = "proposal-secondary-button" }: { quote: QuoteRecord; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
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
  const start = () => {
    const store = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const customer = quote.customer.name.trim().toLowerCase();
    const others = (store?.proposals || []).filter((record) => record.quote.customer.name.trim().toLowerCase() === customer && !idsFor(record.quote).some((id) => id && idsFor(quote).includes(id)) && record.quote.metadata.workflowMode === "major_project");
    const quotes = [quote, ...others.map((record) => record.quote)].map((record) => ensureMajorProjectState(structuredClone(record)));
    quotes.sort((a, b) => {
      const order = (q: QuoteRecord) => { const i = saraIds.findIndex((id) => idsFor(q).includes(id)); return i < 0 ? 99 : i; };
      return order(a) - order(b);
    });
    const next: Choice[] = quotes.flatMap((record, recordIndex) => record.majorProject.options.map((option) => ({
      quote: record, optionId: option.id, key: `${recordIndex}:${option.id}`,
      title: `${record.metadata.documentTitle || record.majorProject.summary.projectName || "Untitled quote"} / ${option.label}`,
    })));
    const inSara = saraIds.some((id) => idsFor(quote).includes(id));
    setChoices(next);
    setSelected(next.filter((choice) => choice.optionId === choice.quote.majorProject.activeOptionId && (inSara ? saraIds.some((id) => idsFor(choice.quote).includes(id)) : idsFor(choice.quote).some((id) => id && idsFor(quote).includes(id)))).map((choice) => choice.key));
    setSplits(next.filter((choice) => idsFor(choice.quote).includes("RCT-1788656996974")).map((choice) => choice.key));
    setError("");
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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to export Quote Master workbook."); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" className={`${className} inline-flex items-center justify-center gap-2`} onClick={start} title="Export internal Quote Master workbook with line-item costs and pricing">
      <FileSpreadsheet size={16} aria-hidden="true" />Quote Master Workbook
    </button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} className="fixed inset-0 m-auto max-h-[90vh] w-[min(860px,calc(100%_-_24px))] max-w-none overflow-y-auto rounded-lg border border-[#cbd5df] bg-white p-0 text-[#18222c] shadow-xl backdrop:bg-black/40" aria-labelledby="quote-master-heading">
      <header className="flex items-center justify-between gap-3 border-b border-[#dce2e8] px-5 py-4">
        <div><h2 id="quote-master-heading" className="text-lg font-semibold">Quote Master Workbook</h2><p className="text-sm text-[#596674]">{quote.customer.name} - Internal approval</p></div>
        <button type="button" aria-label="Close workbook export" title="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#dce2e8]" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      <fieldset className="px-5 py-4" disabled={busy}>
        <legend className="pt-4 text-sm font-semibold">Saved quotes and project options</legend>
        <div className="max-h-60 divide-y divide-[#e3e8ed] overflow-y-auto">
          {choices.map((choice) => <div key={choice.key} className="py-3">
            <label className="flex items-start gap-3 text-sm"><input className="mt-1" type="checkbox" checked={selected.includes(choice.key)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, choice.key] : current.filter((key) => key !== choice.key))} /><span className="min-w-0 break-words">{choice.title}<span className="block text-xs text-[#64717f]">{choice.quote.metadata.proposalNumber}</span></span></label>
            {selected.includes(choice.key) && <label className="ml-6 mt-2 flex items-center gap-2 text-xs text-[#596674]"><input type="checkbox" checked={splits.includes(choice.key)} onChange={(event) => setSplits((current) => event.target.checked ? [...current, choice.key] : current.filter((key) => key !== choice.key))} />Separate cellular and Starlink alternatives</label>}
          </div>)}
        </div>
      </fieldset>
      <section className="border-t border-[#dce2e8] px-5 py-4">
        <h3 className="mb-2 text-sm font-semibold">Workbook columns ({columns.length}/5)</h3>
        {columns.length > 0 && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[#dce2e8] text-xs text-[#596674]"><th className="py-2 pr-3">Scope</th><th className="px-2 text-right">One-time</th><th className="px-2 text-right">Monthly</th><th className="pl-2 text-right">Annual renewal</th></tr></thead><tbody>{columns.map((column, i) => <tr key={i} className="border-b border-[#edf0f3]"><td className="py-2 pr-3">{column.label}</td>{[column.oneTime, column.monthly, column.annual].map((amount, j) => <td key={j} className="whitespace-nowrap px-2 text-right">{amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</td>)}</tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs text-[#596674]">{QUOTE_MASTER_TEMPLATE_NOTICE}</p>
        {(error || validation) && <p role="alert" className="mt-3 text-sm text-[#a90c15]">{error || validation}</p>}
      </section>
      <footer className="flex flex-wrap justify-end gap-3 border-t border-[#dce2e8] px-5 py-4"><button type="button" className="rounded border border-[#cbd5df] px-4 py-2 text-sm" onClick={() => setOpen(false)}>Cancel</button><button type="button" disabled={busy || Boolean(validation)} onClick={() => void download()} className="inline-flex items-center gap-2 rounded bg-[#a90c15] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} {busy ? "Exporting..." : "Download Workbook"}</button></footer>
    </dialog>
  </>;
}

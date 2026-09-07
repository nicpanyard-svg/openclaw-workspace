"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Eye, FileText, MoreHorizontal, Plus, Search, Trash2, X } from "lucide-react";
import { useAuth } from "./auth-shell";
import { QuoteMasterExport } from "./quote-master-export";
import { buildProposalPreviewPath } from "../lib/proposal-navigation";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, QUOTE_STATUS_OPTIONS, createProposalCopy, createProposalFromQuote, deserializeProposalStore, getActiveProposalId, getDefaultProposalStore, isOpenQuoteStatus, mockUsers, serializeProposalStore, upsertProposal, type ProposalStoreData, type SavedProposalRecord } from "../lib/proposal-store";
import { ensureEnvironmentProposalStore } from "../lib/environment-samples";
import { sampleQuoteRecord } from "../lib/sample-quote-record";
import { deleteProposalFromBrowserState } from "../lib/proposal-delete";
import { customerGroupKey, getWorkspaceQuoteSummary } from "../lib/workspace-quote-summary";
import "./quote-workspace.css";

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
}

function SelectionBox({ label, checked, mixed = false, onChange }: { label: string; checked: boolean; mixed?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />;
}

function QuoteActions({ proposal, onCopy, onDelete }: { proposal: SavedProposalRecord; onCopy: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="qw-row-actions" ref={ref} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <Link className="qw-edit" href={`/new?proposalId=${encodeURIComponent(proposal.id)}`}>Edit quote</Link>
    <button ref={trigger} type="button" className="qw-icon" title="More quote actions" aria-label={`More actions for ${proposal.quote.metadata.proposalNumber}`} aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={18} /></button>
    {open && <div className="qw-action-menu">
      <Link href={buildProposalPreviewPath(proposal.id)}><Eye size={16} />Customer preview</Link>
      <Link href={`/proposals/${encodeURIComponent(proposal.id)}`}><FileText size={16} />Details and history</Link>
      <button type="button" onClick={() => { setOpen(false); onCopy(); }}><Copy size={16} />Duplicate quote</button>
      <button type="button" className="qw-delete" onClick={() => { setOpen(false); onDelete(); }}><Trash2 size={16} />Delete quote</button>
    </div>}
  </div>;
}

export function QuoteWorkspace() {
  const { user } = useAuth();
  const [store, setStore] = useState<ProposalStoreData | null>(null);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("mine");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    const read = () => {
      try {
        const fallback = getDefaultProposalStore(createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }));
        const saved = deserializeProposalStore(localStorage.getItem(PROPOSAL_STORE_KEY)) || fallback;
        const next = ensureEnvironmentProposalStore({ ...saved, currentUser: user ? { id: user.id, name: user.name, email: user.email, role: user.title, team: user.team } : saved.currentUser });
        localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(next));
        const active = getActiveProposalId(next, localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY));
        if (active) localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, active);
        setStore(next);
        setStorageError("");
      } catch { setStorageError("Unable to open saved quotes in this browser. Check browser storage and reload."); }
    };
    read();
    const sync = (event: StorageEvent) => { if (event.key === PROPOSAL_STORE_KEY || event.key === null) read(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [user]);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (store?.proposals || []).filter((p) => (owner === "all" || p.owner.id === store?.currentUser.id) && (status === "all" || p.status === status) && (!query || [p.quote.customer.name, p.quote.metadata.documentTitle, p.quote.metadata.proposalNumber, p.owner.name].some((value) => value.toLocaleLowerCase().includes(query))))
      .sort((a, b) => sort === "title" ? a.quote.metadata.documentTitle.localeCompare(b.quote.metadata.documentTitle) : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [store, owner, status, search, sort]);
  const groups = useMemo(() => {
    const map = new Map<string, SavedProposalRecord[]>();
    for (const proposal of visible) {
      const key = customerGroupKey(proposal.quote.customer.name);
      map.set(key, [...(map.get(key) || []), proposal]);
    }
    return [...map.entries()];
  }, [visible]);
  const hardwarePlanning = useMemo(() => {
    const totals = { standard: 0, accessories: 0, custom: 0, terminals: new Map<string, number>() };
    for (const proposal of visible.filter((p) => isOpenQuoteStatus(p.status))) {
      if (!proposal.quote.sections.sectionB.enabled) continue;
      for (const item of proposal.quote.sections.sectionB.lineItems) {
        const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
        if (item.sourceType === "custom") totals.custom += quantity;
        else if (/accessory|mount|cable/i.test(item.itemCategory || "")) totals.accessories += quantity;
        else totals.standard += quantity;
        const terminal = item.terminalType?.trim();
        if (terminal) totals.terminals.set(terminal, (totals.terminals.get(terminal) || 0) + quantity);
      }
    }
    return totals;
  }, [visible]);
  // Filtering also scopes exports, so hidden quotes cannot be exported accidentally.
  const selected = visible.filter((p) => selectedIds.includes(p.id));
  const exportError = selected.some((p) => p.quote.metadata.workflowMode !== "major_project") ? "Quote Master requires Major Project quotes. Convert the selected Quick Quote in the editor first." : new Set(selected.map((p) => customerGroupKey(p.quote.customer.name))).size > 1 ? "Select quotes for one customer to create a Quote Master workbook." : "";
  const toggle = (ids: string[]) => setSelectedIds((current) => ids.every((id) => current.includes(id)) ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  const filter = (update: () => void) => { update(); setSelectedIds([]); };
  const copy = (proposal: SavedProposalRecord) => {
    try {
      const latest = deserializeProposalStore(localStorage.getItem(PROPOSAL_STORE_KEY));
      if (!latest) throw new Error("Reload Workspace before duplicating this quote.");
      const source = latest.proposals.find((p) => p.id === proposal.id);
      if (!source) throw new Error("This quote was removed in another tab. Reload Workspace.");
      const next = createProposalCopy({ proposal: source, owner: source.owner, currentUser: latest.currentUser, existingNumbers: latest.proposals.map((p) => p.quote.metadata.proposalNumber) });
      const nextStore = upsertProposal(latest, next);
      localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
      setStore(nextStore);
      setNotice(`Created ${next.quote.metadata.proposalNumber}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to duplicate this quote."); }
  };
  const remove = (proposal: SavedProposalRecord) => {
    if (!window.confirm(`Delete ${proposal.quote.metadata.proposalNumber} for ${proposal.quote.customer.name}? This removes the saved quote from this browser.`)) return;
    try {
      const deletion = deleteProposalFromBrowserState(proposal.id);
      if (!deletion) return;
      setStore(deletion.nextStore);
      setSelectedIds((ids) => ids.filter((id) => id !== proposal.id));
      setNotice("Quote deleted.");
    } catch { setNotice("Unable to delete this quote. Reload Workspace and try again."); }
  };
  return <main className="qw-workspace">
    <header className="qw-heading"><div><h1>Quotes</h1><p>{store?.proposals.length ?? 0} saved quotes <span className="qw-storage">Saved in this browser</span></p></div><div className="qw-heading-actions"><Link className="qw-button" href="/new?mode=new&entry=major-project"><Plus size={16} />Major Project</Link><Link className="qw-button qw-primary" href="/new?mode=new"><Plus size={16} />Quick Quote</Link></div></header>
    <div className="qw-filters">
      <label className="qw-search"><Search size={18} /><input type="search" placeholder="Search customer, quote, or number" aria-label="Search quotes" value={search} onChange={(event) => filter(() => setSearch(event.target.value))} /></label>
      <label>Owner<select value={owner} onChange={(event) => filter(() => setOwner(event.target.value))}><option value="mine">My quotes</option><option value="all">All owners</option></select></label>
      <label>Status<select value={status} onChange={(event) => filter(() => setStatus(event.target.value))}><option value="all">All statuses</option>{QUOTE_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="title">Quote title</option></select></label>
    </div>
    {notice && <div className="qw-notice" role="status"><Check size={16} />{notice}<button className="qw-icon" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {storageError && <p role="alert" className="qw-error">{storageError}</p>}
    <div className="qw-selection-bar" aria-label="Quote selection">
      <span aria-live="polite">{selected.length ? `${selected.length} selected` : `${visible.length} ${visible.length === 1 ? "quote" : "quotes"}`}</span>
      {selected.length > 0 && <><button className="qw-button qw-quiet" onClick={() => setSelectedIds([])}>Clear selection</button><QuoteMasterExport quote={selected[0].quote} selectedQuotes={selected.map((p) => p.quote)} label="Export selected quotes" className="qw-button qw-primary" disabled={Boolean(exportError)} /></>}
      {exportError && <span className="qw-selection-error" role="status">{exportError}</span>}
    </div>
    {!store && !storageError && <p role="status" className="qw-empty">Loading quotes...</p>}
    {store && !visible.length && <div className="qw-empty"><h2>{store.proposals.length ? "No matching quotes" : "No saved quotes yet"}</h2>{store.proposals.length ? <button className="qw-button" onClick={() => filter(() => { setSearch(""); setOwner("all"); setStatus("all"); })}>Clear filters</button> : <Link className="qw-button qw-primary" href="/new?mode=new">New Quick Quote</Link>}</div>}
    {groups.map(([key, proposals]) => <section className="qw-customer" key={key} aria-label={proposals[0].quote.customer.name || "Unnamed customer"}>
      <header><SelectionBox label={`Select all quotes for ${proposals[0].quote.customer.name}`} checked={proposals.every((p) => selectedIds.includes(p.id))} mixed={proposals.some((p) => selectedIds.includes(p.id)) && !proposals.every((p) => selectedIds.includes(p.id))} onChange={() => toggle(proposals.map((p) => p.id))} /><h2>{proposals[0].quote.customer.name || "Unnamed customer"}</h2><span>{proposals.length}</span></header>
      <div className="qw-table" role="table" aria-label={`${proposals[0].quote.customer.name} quotes`}>
        <div className="qw-table-head" role="row"><span role="columnheader" className="qw-sr-only">Select</span><span role="columnheader">Quote</span><span role="columnheader">Status</span><span role="columnheader" className="qw-number">One-time charges</span><span role="columnheader" className="qw-number">Monthly recurring</span><span role="columnheader" className="qw-number">Annual subscriptions</span><span role="columnheader">Updated</span><span role="columnheader" className="qw-sr-only">Actions</span></div>
        {proposals.map((proposal) => {
          const q = proposal.quote, totals = getWorkspaceQuoteSummary(q), currency = q.metadata.currencyCode;
          return <div className="qw-row" role="row" key={proposal.id} data-selected={selectedIds.includes(proposal.id)}>
            <div role="cell" className="qw-row-select"><SelectionBox label={`Select ${q.metadata.proposalNumber}`} checked={selectedIds.includes(proposal.id)} onChange={() => toggle([proposal.id])} /></div>
            <div role="cell" className="qw-quote-name"><Link href={`/new?proposalId=${encodeURIComponent(proposal.id)}`}>{q.metadata.documentTitle || "Untitled quote"}</Link><div>{q.metadata.proposalNumber}<span>{q.metadata.workflowMode === "major_project" ? "Major Project" : "Quick Quote"}{q.metadata.quoteType === "lease" ? " / Lease" : ""}</span></div>{totals.options.items.length > 0 && <details className="qw-options"><summary>{totals.options.items.length} optional {totals.options.items.length === 1 ? "item" : "items"}</summary><dl><div><dt>One-time options</dt><dd>{money(totals.options.oneTimeTotal, currency)}</dd></div><div><dt>Monthly options</dt><dd>{money(totals.options.monthlyTotal, currency)}</dd></div><div><dt>Annual options</dt><dd>{money(totals.options.annualTotal, currency)}</dd></div></dl></details>}</div>
            <div role="cell" className="qw-row-status"><span className={`qw-status qw-status-${proposal.status}`}>{QUOTE_STATUS_OPTIONS.find((s) => s.value === proposal.status)?.label || proposal.status}</span></div>
            <div role="cell" className="qw-amount" data-label="One-time charges">{money(totals.oneTime, currency)}</div>
            <div role="cell" className="qw-amount" data-label="Monthly recurring">{totals.monthly === null ? <Link className="qw-pending" href={`/new?proposalId=${encodeURIComponent(proposal.id)}`}>Agreement required</Link> : money(totals.monthly, currency)}</div>
            <div role="cell" className="qw-amount" data-label="Annual subscriptions">{money(totals.annualFirstYear, currency)}{totals.annualRenewal !== totals.annualFirstYear && <small>Year 2: {money(totals.annualRenewal, currency)}</small>}</div>
            <div role="cell" className="qw-updated"><time dateTime={proposal.updatedAt}>{new Date(proposal.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time><small>{proposal.owner.name}</small></div>
            <div role="cell" className="qw-actions-cell"><QuoteActions proposal={proposal} onCopy={() => copy(proposal)} onDelete={() => remove(proposal)} /></div>
          </div>;
        })}
      </div>
    </section>)}
    {visible.length > 0 && <details className="qw-planning"><summary>Hardware planning <span>Open quotes / including options</span></summary><dl><div><dt>Standard products</dt><dd>{hardwarePlanning.standard}</dd></div><div><dt>Accessories</dt><dd>{hardwarePlanning.accessories}</dd></div><div><dt>Custom hardware</dt><dd>{hardwarePlanning.custom}</dd></div>{[...hardwarePlanning.terminals].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl></details>}
  </main>;
}

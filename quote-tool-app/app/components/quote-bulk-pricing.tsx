"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, Eye, LoaderCircle, LockKeyhole, RefreshCw, UnlockKeyhole, X } from "lucide-react";
import type { QuoteRecord } from "../lib/quote-record";
import { previewBulkMargin, type BulkMarginEntry, type BulkMarginPreview } from "../lib/quote-bulk-pricing";
import { QuoteExperienceDialog } from "./quote-experience-dialog";
import "./quote-bulk-pricing.css";

export type QuoteBulkPricingProps = {
  quote: QuoteRecord;
  selectedIds: readonly string[];
  /** Apply the reviewed snapshot to the latest quote; reject to retain the review. */
  onApply: (preview: BulkMarginPreview) => void | Promise<void>;
  onClear: () => void;
  onSetLocks: (locked: boolean) => void | Promise<void>;
};

type ReviewSnapshot = { preview: BulkMarginPreview; currency: string };

export function parseBulkMarginInput(value: string): number | null {
  if (!value.trim()) return null;
  const margin = Number(value);
  return Number.isFinite(margin) && margin >= 0 && margin <= 95 ? margin : null;
}

export function isBulkMarginPreviewStale(reviewed: BulkMarginPreview, current: BulkMarginPreview) {
  return reviewed.quoteId !== current.quoteId || reviewed.optionId !== current.optionId
    || reviewed.mode !== current.mode || reviewed.inputFingerprint !== current.inputFingerprint;
}

function billingLabel(entry: BulkMarginEntry) {
  if (entry.usageBased) return `Per ${entry.unit} used`;
  return entry.cadence === "one_time" ? "One-time" : entry.cadence === "monthly" ? "Monthly" : "Annual";
}

function currencyFormatter(currency: string) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }); }
  catch { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }); }
}

export function BulkPricingPreviewTable({ preview, currency }: { preview: BulkMarginPreview; currency: string }) {
  const formatter = currencyFormatter(currency);
  const money = (value: number | null) => value === null || !Number.isFinite(value) ? "Not set" : formatter.format(value);
  return (
    <table className="rq-bulk-preview" role="table">
      <caption className="rq-bulk-sr-only">Selected item selling prices</caption>
      <colgroup><col /><col /><col /><col /></colgroup>
      <thead role="rowgroup"><tr role="row">
        <th scope="col" role="columnheader">Item</th>
        <th scope="col" role="columnheader" className="rq-bulk-money">Current unit price</th>
        <th scope="col" role="columnheader" className="rq-bulk-money">Proposed unit price</th>
        <th scope="col" role="columnheader">Result</th>
      </tr></thead>
      <tbody role="rowgroup">{preview.entries.map((entry) => (
        <tr key={entry.id} role="row" data-skipped={!entry.eligible}>
          <th scope="row" role="rowheader">
            {entry.label}
            <small>{entry.usageBased ? billingLabel(entry) : `Qty ${entry.quantity} / ${billingLabel(entry)}`}{entry.startsYear === 2 ? " / From year 2" : ""}{entry.optional ? " / Optional" : ""}</small>
          </th>
          <td className="rq-bulk-money" role="cell">
            <span className="rq-bulk-preview-mobile-label" aria-hidden="true">Current unit price</span>
            {entry.priceStatus === "included" ? "Included" : entry.priceStatus === "tbd" && !entry.currentUnitPrice ? "TBD" : money(entry.currentUnitPrice)}
            {entry.priceStatus === "tbd" && Boolean(entry.currentUnitPrice) && <small>TBD</small>}
            {entry.priceStatus === "allowance" && <small>Allowance</small>}
            {!entry.usageBased && entry.priceStatus !== "included" && entry.priceStatus !== "tbd" && <small>{money(entry.currentExtendedPrice)} total</small>}
          </td>
          <td className="rq-bulk-money" role="cell">
            <span className="rq-bulk-preview-mobile-label" aria-hidden="true">Proposed unit price</span>
            {entry.eligible ? money(entry.newUnitPrice) : "Unchanged"}
            {entry.eligible && !entry.usageBased && <small>{money(entry.newExtendedPrice)} total</small>}
          </td>
          <td className="rq-bulk-result" role="cell">
            {entry.eligible ? "Apply margin" : entry.skippedReason || "Skipped"}
            {entry.eligible && entry.priceStatus === "tbd" && <small>Pricing status: Confirmed</small>}
            {entry.eligible && entry.priceStatus === "allowance" && <small>Pricing status stays Allowance</small>}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export function BulkPricingChangeSummary({ preview, currency }: { preview: BulkMarginPreview; currency: string }) {
  const groups = new Map<string, { label: string; currentCents: number; proposedCents: number; order: number }>();
  for (const entry of preview.entries) {
    if (!entry.eligible || entry.usageBased || entry.currentExtendedPrice === null || entry.newExtendedPrice === null) continue;
    const key = `${entry.cadence}-${entry.startsYear}-${entry.optional ? "optional" : "required"}`;
    const group = groups.get(key) ?? {
      label: `${billingLabel(entry)} / ${entry.optional ? "Optional" : "Required"} / From year ${entry.startsYear}`,
      currentCents: 0,
      proposedCents: 0,
      order: (entry.cadence === "one_time" ? 0 : entry.cadence === "monthly" ? 1 : 2) * 4 + (entry.startsYear - 1) * 2 + Number(entry.optional),
    };
    group.currentCents += Math.round(entry.currentExtendedPrice * 100);
    group.proposedCents += Math.round(entry.newExtendedPrice * 100);
    groups.set(key, group);
  }
  if (!groups.size) return null;
  const formatter = currencyFormatter(currency);
  return <table className="rq-bulk-change-summary" role="table">
    <caption>Selected price changes</caption>
    <colgroup><col /><col /><col /></colgroup>
    <thead role="rowgroup"><tr role="row">
      <th scope="col" role="columnheader">Scope</th>
      <th scope="col" role="columnheader" className="rq-bulk-money">Current</th>
      <th scope="col" role="columnheader" className="rq-bulk-money">Proposed</th>
    </tr></thead>
    <tbody role="rowgroup">{[...groups.entries()].sort((a, b) => a[1].order - b[1].order).map(([key, group]) => <tr key={key} role="row" data-group={key}>
      <th scope="row" role="rowheader">{group.label}</th>
      <td role="cell" className="rq-bulk-money"><span className="rq-bulk-preview-mobile-label" aria-hidden="true">Current</span>{formatter.format(group.currentCents / 100)}</td>
      <td role="cell" className="rq-bulk-money"><span className="rq-bulk-preview-mobile-label" aria-hidden="true">Proposed</span>{formatter.format(group.proposedCents / 100)}</td>
    </tr>)}</tbody>
  </table>;
}

function BulkMarginReview({
  quote,
  selectedIds,
  snapshot,
  onRefresh,
  onApply,
  onClose,
}: {
  quote: QuoteRecord;
  selectedIds: readonly string[];
  snapshot: ReviewSnapshot;
  onRefresh: (snapshot: ReviewSnapshot) => void;
  onApply: QuoteBulkPricingProps["onApply"];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const { preview } = snapshot;
  const current = useMemo(
    () => previewBulkMargin(quote, [...selectedIds], preview.marginPercent),
    [quote, selectedIds, preview.marginPercent],
  );
  const stale = isBulkMarginPreviewStale(preview, current);
  const refresh = () => {
    setError("");
    onRefresh({ preview: current, currency: quote.metadata.currencyCode || "USD" });
  };
  const apply = async () => {
    if (inFlight.current || stale || preview.error || preview.applicableCount === 0) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try { await onApply(preview); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to apply pricing. Review the quote and try again."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return (
    <QuoteExperienceDialog title="Review margin changes" className="rq-bulk-dialog" onClose={onClose} closeDisabled={busy}>
      <form onSubmit={(event) => { event.preventDefault(); void apply(); }} aria-busy={busy}>
        <div className="rq-bulk-body">
          <div className="rq-bulk-summary">
            <strong>{preview.marginPercent}% margin</strong>
            <span>{preview.selectionCount} selected</span>
            <span>{preview.applicableCount} to update / {preview.skippedCount} skipped</span>
          </div>
          {stale && <div className="rq-bulk-stale">
            <p role="alert">The quote or selection changed. Refresh this preview before applying prices.</p>
            <button type="button" className="rq-bulk-button" disabled={busy} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />Refresh preview</button>
          </div>}
          {preview.entries.length > 0 ? <BulkPricingPreviewTable preview={preview} currency={snapshot.currency} /> : <p>No items selected.</p>}
          <BulkPricingChangeSummary preview={preview} currency={snapshot.currency} />
          {preview.error && <p className="rq-bulk-error" role="alert">{preview.error}</p>}
          {!preview.error && preview.applicableCount === 0 && <p className="rq-bulk-notice" role="status">No selected prices can be updated.</p>}
          {error && <p className="rq-bulk-error" role="alert">{error}</p>}
        </div>
        <footer className="rq-bulk-footer">
          <span role="status" aria-live="polite">{busy ? "Applying prices..." : `${preview.applicableCount} ${preview.applicableCount === 1 ? "item" : "items"} to update`}</span>
          <div className="rq-bulk-footer-actions">
            <button type="button" className="rq-bulk-button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="rq-bulk-button rq-bulk-primary" disabled={busy || stale || Boolean(preview.error) || preview.applicableCount === 0}>
              {busy ? <LoaderCircle size={16} aria-hidden="true" className="rq-bulk-spinner" /> : <Check size={16} aria-hidden="true" />}
              {busy ? "Applying..." : "Apply prices"}
            </button>
          </div>
        </footer>
      </form>
    </QuoteExperienceDialog>
  );
}

export function QuoteBulkPricing({ quote, selectedIds, onApply, onClear, onSetLocks }: QuoteBulkPricingProps) {
  const [marginInput, setMarginInput] = useState("30");
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [lockAction, setLockAction] = useState<"lock" | "unlock" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const id = useId();
  const margin = parseBulkMarginInput(marginInput);
  const count = new Set(selectedIds).size;
  const busy = lockAction !== null;
  const setLocks = async (locked: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLockAction(locked ? "lock" : "unlock");
    setError("");
    setNotice("");
    try { await onSetLocks(locked); setNotice(locked ? "Selected prices locked." : "Selected prices unlocked."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change price locks. Try again."); }
    finally { inFlight.current = false; setLockAction(null); }
  };
  const openPreview = () => {
    if (margin === null || busy) return;
    setError("");
    setNotice("");
    try { setSnapshot({ preview: previewBulkMargin(quote, [...selectedIds], margin), currency: quote.metadata.currencyCode || "USD" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to preview pricing. Review the selected items."); }
  };
  if (!count && !snapshot) return null;
  return <>
    {count > 0 && <div className="rq-bulk-pricing" aria-busy={busy}>
      <div className="rq-bulk-toolbar" role="group" aria-label="Bulk pricing">
        <strong className="rq-bulk-count" role="status" aria-live="polite">{count} selected</strong>
        <div className="rq-bulk-presets" role="group" aria-label="Margin presets">
          {[15, 30, 55].map((preset) => <button key={preset} type="button" className="rq-bulk-button rq-bulk-preset" aria-label={`${preset}% margin`} aria-pressed={margin === preset} disabled={busy} onClick={() => setMarginInput(String(preset))}>{preset}%</button>)}
        </div>
        <label className="rq-bulk-custom" htmlFor={`${id}-margin`}>
          Margin %
          <input id={`${id}-margin`} type="number" min={0} max={95} step="any" inputMode="decimal" value={marginInput} disabled={busy} aria-invalid={margin === null} aria-describedby={margin === null ? `${id}-margin-error` : undefined} onChange={(event) => setMarginInput(event.currentTarget.value)} />
        </label>
        <button type="button" className="rq-bulk-button" disabled={busy || margin === null} onClick={openPreview}><Eye size={16} aria-hidden="true" />Preview prices</button>
        <div className="rq-bulk-tools" role="group" aria-label="Selected item actions">
          <button type="button" className="rq-bulk-button rq-bulk-icon" title="Lock selected prices" data-tooltip="Lock selected prices" aria-label="Lock selected prices" disabled={busy} onClick={() => void setLocks(true)}>
            {lockAction === "lock" ? <LoaderCircle size={16} aria-hidden="true" className="rq-bulk-spinner" /> : <LockKeyhole size={16} aria-hidden="true" />}
          </button>
          <button type="button" className="rq-bulk-button rq-bulk-icon" title="Unlock selected prices" data-tooltip="Unlock selected prices" aria-label="Unlock selected prices" disabled={busy} onClick={() => void setLocks(false)}>
            {lockAction === "unlock" ? <LoaderCircle size={16} aria-hidden="true" className="rq-bulk-spinner" /> : <UnlockKeyhole size={16} aria-hidden="true" />}
          </button>
          <button type="button" className="rq-bulk-button rq-bulk-icon" title="Clear selection" data-tooltip="Clear selection" aria-label="Clear selection" disabled={busy} onClick={() => { setError(""); setNotice(""); onClear(); }}><X size={16} aria-hidden="true" /></button>
        </div>
      </div>
      {margin === null && <p className="rq-bulk-error" id={`${id}-margin-error`} role="alert">Enter a margin from 0% to 95%.</p>}
      {error && <p className="rq-bulk-error" role="alert">{error}</p>}
      {(busy || notice) && <p className="rq-bulk-notice" role="status">{busy ? "Updating price locks..." : notice}</p>}
    </div>}
    {snapshot && <BulkMarginReview quote={quote} selectedIds={selectedIds} snapshot={snapshot} onRefresh={setSnapshot} onApply={onApply} onClose={() => setSnapshot(null)} />}
  </>;
}

export default QuoteBulkPricing;

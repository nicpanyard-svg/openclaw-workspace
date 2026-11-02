"use client";

import { useMemo, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { buildProFormaFileName, buildProFormaInvoice } from "../lib/pro-forma";
import { buildProFormaHtml } from "../lib/pro-forma-html";
import type { ProFormaSettings, QuoteRecord } from "../lib/quote-record";
import "./pro-forma.css";

type Props = {
  quote: QuoteRecord;
  onChange: (update: (draft: QuoteRecord) => QuoteRecord) => void;
  getQuote: () => QuoteRecord | undefined;
  onReview: () => void;
};

export function ProFormaPanel({ quote, onChange, getQuote, onReview }: Props) {
  const invoice = useMemo(() => buildProFormaInvoice(quote), [quote]);
  const html = useMemo(() => buildProFormaHtml(invoice), [invoice]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof ProFormaSettings, value: string) => {
    setError("");
    onChange(draft => { draft.proForma = { ...invoice.settings, [key]: value }; return draft; });
  };
  const download = async () => {
    if (busy || invoice.errors.length) return;
    setError("");
    const saved = getQuote();
    if (!saved) return;
    setBusy(true);
    try {
      const response = await fetch("/api/pro-forma-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quote: saved }) });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string; missingFields?: string[] };
        throw new Error(result.missingFields?.join("; ") || result.error || "The PDF could not be generated. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = buildProFormaFileName(saved);
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download the invoice."); }
    finally { setBusy(false); }
  };
  return <section className="pf-panel" aria-labelledby="pf-heading">
    <div className="rq-section-heading"><h2 id="pf-heading">Pro Forma Invoice</h2><button type="button" className="rq-button rq-button-primary" disabled={busy || invoice.errors.length > 0} onClick={() => void download()}>{busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{busy ? "Generating PDF..." : "Download invoice PDF"}</button></div>
    <div className="pf-fields">
      <label className="builder-field"><span>Invoice reference</span><input maxLength={100} value={invoice.settings.reference} onChange={event => update("reference", event.target.value)} /></label>
      <label className="builder-field"><span>Invoice date</span><input type="date" value={invoice.settings.issueDate} onChange={event => update("issueDate", event.target.value)} /></label>
      <label className="builder-field"><span>Customer PO (optional)</span><input maxLength={160} value={invoice.settings.customerPo} onChange={event => update("customerPo", event.target.value)} /></label>
      <label className="builder-field"><span>Billing period (optional)</span><input maxLength={160} value={invoice.settings.billingPeriod} onChange={event => update("billingPeriod", event.target.value)} /></label>
      <label className="builder-field pf-notes"><span>Invoice notes (customer-facing)</span><textarea rows={2} maxLength={3000} value={invoice.settings.notes} onChange={event => update("notes", event.target.value)} /></label>
    </div>
    {invoice.errors.length > 0 && <div className="pf-validation"><strong>Before downloading</strong><ul>{invoice.errors.map(message => <li key={message}>{message}</li>)}</ul><button type="button" className="rq-button" onClick={onReview}>Review quote</button></div>}
    {error && <p className="rq-notice rq-notice-warning" role="alert">{error}</p>}
    <iframe className="pf-preview" title="Pro forma invoice preview" sandbox="allow-same-origin" srcDoc={html} />
  </section>;
}

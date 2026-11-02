"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Mail, Paperclip, Send } from "lucide-react";
import { QuoteExperienceDialog } from "./quote-experience-dialog";
import { buildDocuSignRequest, DOCUSIGN_COORDINATOR, invoiceEmailValidation, MAX_INVOICE_EMAIL_BYTES, OutlookSubmissionError, submitInvoiceMail } from "../lib/pro-forma-email";
import { connectOutlook, getOutlookConfiguration, getOutlookSendToken, initializeOutlook, outlookConnectionError, OUTLOOK_SETUP_MESSAGE, type OutlookAccount } from "../lib/outlook-connection";
import { requestProFormaPdf } from "../lib/pro-forma-pdf-client";
import type { QuoteRecord } from "../lib/quote-record";

export function ProFormaEmailDialog({ quote, onClose, onSubmitted }: {
  quote: QuoteRecord;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}) {
  const [draft, setDraft] = useState(() => buildDocuSignRequest(quote));
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState<OutlookAccount | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [checkedSentItems, setCheckedSentItems] = useState(false);
  const inFlight = useRef(false);
  const configured = Boolean(getOutlookConfiguration());
  const busy = connecting || sending;
  const validation = invoiceEmailValidation(draft);

  useEffect(() => {
    let active = true;
    void requestProFormaPdf(quote).then(blob => {
      if (blob.size > MAX_INVOICE_EMAIL_BYTES) throw new Error("The PDF is larger than the 2.8 MB email limit. Download it and send it from Outlook.");
      if (active) { setPdf(blob); setPdfError(""); }
    }).catch(cause => { if (active) setPdfError(cause instanceof Error ? cause.message : "Could not prepare the invoice PDF."); });
    return () => { active = false; };
  }, [quote, attempt]);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void initializeOutlook().then(() => { if (active) setReady(true); }).catch(() => { if (active) setError("Outlook could not initialize. Close this request and try again."); });
    return () => { active = false; };
  }, [configured]);

  const connect = async () => {
    if (busy || !ready) return;
    setConnecting(true); setError("");
    try { setAccount(await connectOutlook()); }
    catch (cause) { setError(outlookConnectionError(cause)); }
    finally { setConnecting(false); }
  };

  const send = async () => {
    if (inFlight.current || busy || submitted || !account || !pdf || validation || (uncertain && !checkedSentItems)) return;
    inFlight.current = true; setSending(true); setError("");
    try {
      const token = await getOutlookSendToken(account);
      await submitInvoiceMail(token, draft, { name: draft.fileName, pdf });
      setSubmitted(true);
      onSubmitted(`Submitted to Outlook for delivery to ${DOCUSIGN_COORDINATOR.name} from ${account.username}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the email.");
      if (cause instanceof OutlookSubmissionError && cause.uncertain) { setUncertain(true); setCheckedSentItems(false); }
    } finally { inFlight.current = false; setSending(false); }
  };

  return <QuoteExperienceDialog title="Send for DocuSign" className="pf-email-dialog" onClose={onClose} closeDisabled={busy}>
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <div className="pf-email-body">
        <dl className="pf-email-addresses">
          <div><dt>To</dt><dd><strong>{DOCUSIGN_COORDINATOR.name}</strong><span>{DOCUSIGN_COORDINATOR.role}</span><span>{DOCUSIGN_COORDINATOR.email}</span></dd></div>
          <div><dt>From</dt><dd><span>{account?.username || "Your Microsoft 365 account"}</span>{!submitted && <button type="button" className="qx-button" onClick={() => void connect()} disabled={!ready || busy}><Mail size={16} aria-hidden="true" />{connecting ? "Connecting..." : account ? "Change account" : "Connect Outlook"}</button>}</dd></div>
        </dl>
        {!configured && <p className="pf-email-warning" role="status">{OUTLOOK_SETUP_MESSAGE}</p>}
        <label className="pf-email-field"><span>Subject</span><input value={draft.subject} maxLength={240} required disabled={busy || submitted} onChange={event => setDraft(current => ({ ...current, subject: event.target.value }))} /></label>
        <label className="pf-email-field"><span>Message</span><textarea value={draft.body} maxLength={12000} rows={10} required disabled={busy || submitted} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} /></label>
        <div className="pf-email-attachment" aria-live="polite"><Paperclip size={18} aria-hidden="true" /><div><strong>{draft.fileName}</strong><span>{pdf ? `PDF attached (${Math.ceil(pdf.size / 1024)} KB)` : pdfError ? "PDF not attached" : "Preparing invoice PDF..."}</span></div></div>
        {pdfError && <div className="pf-email-error" role="alert">{pdfError}<button type="button" className="qx-button" onClick={() => { setPdfError(""); setAttempt(value => value + 1); }}>Retry PDF</button></div>}
        {validation && <p className="pf-email-error" role="alert">{validation}</p>}
        {error && <p className="pf-email-error" role="alert">{error}</p>}
        {uncertain && !submitted && <label className="pf-email-retry"><input type="checkbox" checked={checkedSentItems} disabled={busy} onChange={event => setCheckedSentItems(event.target.checked)} /><span>I checked Sent Items and want to send another request.</span></label>}
        {submitted && <div className="pf-email-success" role="status"><Check size={20} aria-hidden="true" /><p><strong>Submitted to Outlook</strong><span>Request addressed to Ruthie Ramay. A copy is saved in Sent Items. Ruthie will arrange DocuSign; this is not an approval or a signed invoice.</span></p></div>}
      </div>
      <footer className="pf-email-footer"><button type="button" className="qx-button" onClick={onClose} disabled={busy}>{submitted ? "Done" : "Cancel"}</button>{!submitted && <button type="submit" className="qx-button qx-primary" disabled={!account || !pdf || busy || Boolean(validation) || (uncertain && !checkedSentItems)}>{sending ? <LoaderCircle size={16} aria-hidden="true" className="animate-spin" /> : <Send size={16} aria-hidden="true" />}{sending ? "Submitting..." : "Send to Ruthie"}</button>}</footer>
    </form>
  </QuoteExperienceDialog>;
}

"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { PROPOSAL_STORE_KEY, type ProposalStoreData } from "../lib/proposal-store";

export function QuoteBackupControls({ store, onRestored }: { store: ProposalStoreData; onRestored: (store: ProposalStoreData) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const download = async () => {
    setBusy(true); setMessage(""); setError("");
    try {
      const { createQuoteBackup, parseBackupStore } = await import("../lib/quote-backup");
      const raw = localStorage.getItem(PROPOSAL_STORE_KEY);
      const backup = await createQuoteBackup(raw ? parseBackupStore(raw) : store);
      const url = URL.createObjectURL(backup.blob);
      const link = document.createElement("a");
      link.href = url; link.download = backup.fileName;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`Downloaded ${backup.quoteCount} saved quotes. Keep this file in your approved company storage.${backup.missingAttachments.length ? ` ${backup.missingAttachments.length} referenced attachments were missing from this browser: ${backup.missingAttachments.join(", ")}. Reattach those files before relying on this backup.` : " Attached files are included."}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create backup."); }
    finally { setBusy(false); }
  };
  const restore = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const { readQuoteBackup, restoreQuoteBackup } = await import("../lib/quote-backup");
      const backup = await readQuoteBackup(file);
      if (!window.confirm(`Restore ${backup.manifest.store.proposals.length} quotes? Existing quotes will be kept; matching quote IDs will be skipped.${backup.missingAttachments.length ? ` This backup is missing ${backup.missingAttachments.length} attached files.` : ""}`)) return;
      const result = await restoreQuoteBackup(backup, localStorage, store);
      onRestored(result.store);
      setMessage(`Restored ${result.added} quotes; kept ${result.skipped} existing matches.${backup.missingAttachments.length ? " Some attachments are missing; reattach them before export." : ""}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to restore backup. No existing quotes were replaced."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <details className="qw-backup">
    <summary>Back up or restore quotes</summary>
    <p>Save any open draft first. Backups include all saved quotes in this browser and their attached files. Restoring keeps existing quotes. Sign-in accounts are not included.</p>
    <div className="qw-heading-actions">
      <button type="button" className="qw-button" disabled={busy} onClick={() => void download()}><Download size={16} />{busy ? "Working…" : "Download backup"}</button>
      <button type="button" className="qw-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />Restore backup</button>
      <input ref={input} type="file" accept=".zip,application/zip" hidden aria-label="Choose RapidQuote backup" onChange={(event) => void restore(event.target.files?.[0])} />
    </div>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert" className="qw-error">{error}</p>}
  </details>;
}

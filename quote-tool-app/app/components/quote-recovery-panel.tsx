"use client";

import { AlertTriangle, Check, History, LoaderCircle, Monitor, RotateCcw, Save } from "lucide-react";
import type { QuoteRecoveryControls } from "./use-quote-recovery";
import styles from "./quote-recovery-panel.module.css";

const statusLabels = {
  loading: "Checking browser save",
  saved: "Saved to Workspace in this browser",
  pending: "Unsaved changes",
  saving: "Saving to this browser",
  error: "Not saved",
  conflict: "Save paused",
  recovered: "Recovered draft - not saved",
};

export function QuoteRecoveryPanel({ recovery }: { recovery: QuoteRecoveryControls }) {
  const busy = recovery.status === "saving" || recovery.status === "loading";
  const hasError = recovery.status === "error" || recovery.status === "conflict";
  const StatusIcon = busy ? LoaderCircle : hasError ? AlertTriangle : recovery.status === "saved" ? Check : Monitor;
  return (
    <section className={styles.panel} aria-label="Browser save and recovery">
      <div className={styles.bar}>
        <div className={styles.status} role="status" aria-live="polite">
          <StatusIcon size={16} aria-hidden="true" />
          <span><strong>{statusLabels[recovery.status]}</strong>
            {recovery.status === "saved" && recovery.savedAt && <time dateTime={recovery.savedAt}> at {new Date(recovery.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
          </span>
        </div>
        <span className={styles.localOnly}>This browser only. Not synced or backed up online.</span>
        {(recovery.status === "error" || recovery.status === "recovered") && <button type="button" className={styles.action} onClick={() => void recovery.saveNow()} disabled={busy}><Save size={16} aria-hidden="true" />Save draft</button>}
      </div>
      {recovery.error && <p className={styles.error} role="alert">{recovery.error}</p>}
      {recovery.status === "conflict" && <a className={styles.link} href="/workspace" target="_blank" rel="noreferrer">Open Workspace in a new tab</a>}
      {recovery.paused && <p className={styles.notice}>Autosave is paused. Save draft to keep the recovered version.</p>}
      {recovery.historyWarning && <p className={styles.notice} role="status">{recovery.historyWarning}</p>}
      <details className={styles.history}>
        <summary><History size={16} aria-hidden="true" />Recovery history <span>({recovery.versions.length})</span></summary>
        {recovery.versions.length === 0 ? <p className={styles.notice}>No recovery versions in this browser.</p> : <ul>
          {recovery.versions.map((version) => <li key={version.id}>
            <div><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString()}</time>
              <span className={styles.reason}>{version.reason === "before-save" ? "Before save" : version.reason === "before-recovery" ? "Before recovery" : version.reason === "manual" ? "Manual save" : "Autosave"}</span></div>
            <button type="button" className={styles.action} disabled={busy || recovery.status === "conflict"} onClick={() => void recovery.recover(version.id)} aria-label={`Load recovery version from ${new Date(version.createdAt).toLocaleString()}`}>
              <RotateCcw size={16} aria-hidden="true" />Load draft
            </button>
          </li>)}
        </ul>}
      </details>
    </section>
  );
}

export default QuoteRecoveryPanel;

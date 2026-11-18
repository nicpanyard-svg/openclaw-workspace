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
  conflict: "Not saved: quote changed in another tab",
  recovered: "Previous version opened - not saved",
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
      {recovery.status === "conflict" && <a className={styles.link} href="/workspace" target="_blank" rel="noreferrer">View saved quotes in a new tab</a>}
      {recovery.paused && <p className={styles.notice}>Select Save draft to replace the saved quote with this version. Automatic saving is paused until then.</p>}
      {recovery.historyWarning && <p className={styles.notice} role="status">{recovery.historyWarning}</p>}
      <details className={styles.history}>
        <summary><History size={16} aria-hidden="true" />Previous versions <span>({recovery.versions.length})</span></summary>
        {recovery.versions.length === 0 ? <p className={styles.notice}>No previous versions saved in this browser.</p> : <ul>
          {recovery.versions.map((version) => <li key={version.id}>
            <div><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString()}</time>
              <span className={styles.reason}>{version.reason === "before-save" ? "Before the last save" : version.reason === "before-recovery" ? "Before opening a previous version" : version.reason === "manual" ? "Saved with Save draft" : "Saved automatically"}</span></div>
            <button type="button" className={styles.action} disabled={busy || recovery.status === "conflict"} onClick={() => void recovery.recover(version.id)} aria-label={`Open previous version from ${new Date(version.createdAt).toLocaleString()}`} title="Open for review. The saved quote is unchanged until you select Save draft.">
              <RotateCcw size={16} aria-hidden="true" />Open this version
            </button>
          </li>)}
        </ul>}
      </details>
    </section>
  );
}

export default QuoteRecoveryPanel;

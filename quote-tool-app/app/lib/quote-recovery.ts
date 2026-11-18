import type { QuoteRecord } from "./quote-record";
import type { ProposalStoreData, SavedProposalRecord } from "./proposal-store";
import { deserializeQuoteRecord } from "./proposal-state";
import { scopeStorageKey } from "./app-environment";
import { assertProposalRevision, getProposalRevision, isProposalDeleted, ProposalSaveConflict, type WorkspaceStorage } from "./proposal-saving";

export const RECOVERY_DATABASE = scopeStorageKey("rapidquote:quote-recovery");
const RECOVERY_STORE = "quotes";
export const RECOVERY_LIMITS = { versions: 8, quoteBytes: 12 * 1024 * 1024, totalBytes: 48 * 1024 * 1024, quotes: 40 };
export type RecoveryReason = "autosave" | "manual" | "before-save" | "before-recovery";
export type QuoteRecoverySnapshot = {
  version: 1;
  id: string;
  quoteId: string;
  createdAt: string;
  reason: RecoveryReason;
  quoteJson: string;
};
type RecoveryEnvelope = { quoteId: string; snapshots: QuoteRecoverySnapshot[] };
export type QuoteRecoveryStore = {
  list(quoteId: string): Promise<QuoteRecoverySnapshot[]>;
  append(snapshot: QuoteRecoverySnapshot): Promise<void>;
  remove(quoteId: string): Promise<void>;
};

export function recoveryQuoteId(quote: QuoteRecord) {
  return quote.internal.savedProposalId || quote.internal.quoteId;
}

export function quoteContentKey(quote: QuoteRecord) {
  const normalized = deserializeQuoteRecord(JSON.stringify(quote)) ?? quote;
  return JSON.stringify({ ...normalized, metadata: { ...normalized.metadata, lastTouchedAt: undefined } }, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}

export function readRecoveryQuote(value: unknown, quoteId: string): QuoteRecord | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<QuoteRecoverySnapshot>;
  if (snapshot.version !== 1 || snapshot.quoteId !== quoteId || typeof snapshot.id !== "string" || !snapshot.id
    || typeof snapshot.createdAt !== "string" || !Number.isFinite(Date.parse(snapshot.createdAt))
    || !["autosave", "manual", "before-save", "before-recovery"].includes(snapshot.reason ?? "")
    || typeof snapshot.quoteJson !== "string" || snapshot.quoteJson.length > RECOVERY_LIMITS.quoteBytes) return null;
  try {
    const quote = deserializeQuoteRecord(snapshot.quoteJson);
    if (!quote || recoveryQuoteId(quote) !== quoteId) return null;
    // Use the same safe normalization as Workspace, never pass unchecked JSON into the editor.
    return quote;
  } catch { return null; }
}

export function parseRecoveryHistory(value: unknown, quoteId: string): QuoteRecoverySnapshot[] {
  const envelope = value as Partial<RecoveryEnvelope> | null;
  if (!envelope || envelope.quoteId !== quoteId || !Array.isArray(envelope.snapshots)) return [];
  const seen = new Set<string>();
  return envelope.snapshots.filter((entry): entry is QuoteRecoverySnapshot => {
    if (!readRecoveryQuote(entry, quoteId) || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createRecoverySnapshot(quote: QuoteRecord, reason: RecoveryReason, now = new Date()): QuoteRecoverySnapshot {
  const quoteId = recoveryQuoteId(quote);
  const snapshot: QuoteRecoverySnapshot = {
    version: 1, id: crypto.randomUUID(), quoteId, createdAt: now.toISOString(), reason, quoteJson: JSON.stringify(quote),
  };
  if (!quoteId || !readRecoveryQuote(snapshot, quoteId)) throw new Error("This draft does not have a valid quote identity for recovery.");
  return snapshot;
}

function snapshotBytes(snapshot: QuoteRecoverySnapshot) {
  return new TextEncoder().encode(snapshot.quoteJson).byteLength;
}

export function appendRecoveryHistory(value: unknown, snapshot: QuoteRecoverySnapshot, limits = RECOVERY_LIMITS): RecoveryEnvelope {
  if (!readRecoveryQuote(snapshot, snapshot.quoteId)) throw new Error("The recovery version could not be read.");
  let bytes = snapshotBytes(snapshot);
  if (bytes > limits.quoteBytes) throw new Error("This quote is too large for local recovery history. Workspace saving can still be used.");
  const history = parseRecoveryHistory(value, snapshot.quoteId);
  if (history[0]?.quoteJson === snapshot.quoteJson) return { quoteId: snapshot.quoteId, snapshots: history.slice(0, limits.versions) };
  const snapshots = [snapshot];
  for (const entry of history) {
    if (entry.id === snapshot.id) continue;
    const size = snapshotBytes(entry);
    if (snapshots.length >= limits.versions || bytes + size > limits.quoteBytes) break;
    snapshots.push(entry);
    bytes += size;
  }
  return { quoteId: snapshot.quoteId, snapshots };
}

export function pruneRecoveryEnvelopes(values: unknown[], keepQuoteId: string, limits = RECOVERY_LIMITS): RecoveryEnvelope[] {
  const valid = values.flatMap((value) => {
    const id = (value as Partial<RecoveryEnvelope> | null)?.quoteId;
    if (typeof id !== "string") return [];
    const snapshots = parseRecoveryHistory(value, id);
    return snapshots.length ? [{ quoteId: id, snapshots }] : [];
  }).sort((a, b) => a.quoteId === keepQuoteId ? -1 : b.quoteId === keepQuoteId ? 1 : b.snapshots[0].createdAt.localeCompare(a.snapshots[0].createdAt));
  let bytes = 0;
  return valid.filter((entry, index) => {
    const size = entry.snapshots.reduce((sum, snapshot) => sum + snapshotBytes(snapshot), 0);
    if (index >= limits.quotes || bytes + size > limits.totalBytes) return false;
    bytes += size;
    return true;
  });
}

function openRecoveryDatabase(factory: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(RECOVERY_DATABASE, 1);
    let finished = false;
    const timeout = setTimeout(() => {
      finished = true;
      reject(new Error("Recovery storage is busy or unavailable. Close other RapidQuote tabs and try again."));
    }, 4000);
    request.onupgradeneeded = () => request.result.createObjectStore(RECOVERY_STORE, { keyPath: "quoteId" });
    request.onerror = () => { finished = true; clearTimeout(timeout); reject(request.error); };
    request.onsuccess = () => {
      clearTimeout(timeout);
      if (finished) { request.result.close(); return; }
      finished = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export function createIndexedDbRecoveryStore(factory?: IDBFactory): QuoteRecoveryStore {
  const connect = () => {
    const available = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (!available) throw new Error("Recovery history is unavailable in this browser.");
    return openRecoveryDatabase(available);
  };
  const list = async (quoteId: string) => {
    const database = await connect();
    try {
      return await new Promise<QuoteRecoverySnapshot[]>((resolve, reject) => {
        const transaction = database.transaction(RECOVERY_STORE, "readonly");
        const request = transaction.objectStore(RECOVERY_STORE).get(quoteId);
        transaction.oncomplete = () => resolve(parseRecoveryHistory(request.result, quoteId));
        transaction.onabort = () => reject(transaction.error ?? new Error("Recovery history could not be read."));
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  };
  return {
    list,
    async append(snapshot) {
      const database = await connect();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(RECOVERY_STORE, "readwrite");
          const store = transaction.objectStore(RECOVERY_STORE);
          const request = store.getAll();
          let failure: unknown;
          request.onsuccess = () => {
            try {
              const values = request.result as RecoveryEnvelope[];
              const current = values.find((entry) => entry.quoteId === snapshot.quoteId);
              const next = appendRecoveryHistory(current, snapshot);
              const retained = pruneRecoveryEnvelopes([...values.filter((entry) => entry.quoteId !== snapshot.quoteId), next], snapshot.quoteId);
              const ids = new Set(retained.map((entry) => entry.quoteId));
              for (const entry of values) if (!ids.has(entry.quoteId)) store.delete(entry.quoteId);
              store.put(next);
            } catch (error) { failure = error; transaction.abort(); }
          };
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(failure ?? transaction.error ?? new Error("Recovery history could not be saved."));
          transaction.onerror = () => reject(transaction.error);
        });
      } finally { database.close(); }
      const versions = await list(snapshot.quoteId);
      if (!versions.some((entry) => entry.id === snapshot.id || entry.quoteJson === snapshot.quoteJson)) throw new Error("The recovery version could not be verified.");
    },
    async remove(quoteId) {
      const database = await connect();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(RECOVERY_STORE, "readwrite");
          transaction.objectStore(RECOVERY_STORE).delete(quoteId);
          transaction.oncomplete = () => resolve();
          transaction.onabort = () => reject(transaction.error);
          transaction.onerror = () => reject(transaction.error);
        });
      } finally { database.close(); }
    },
  };
}

export type RecoverySaveRequest = { quote: QuoteRecord; expectedRevision: string | null; reason: "autosave" | "manual" };
export type RecoverySaveResult = { proposal: SavedProposalRecord; store: ProposalStoreData };
export type QuoteRecoveryState = {
  status: "loading" | "saved" | "pending" | "saving" | "error" | "conflict" | "recovered";
  dirty: boolean;
  error: string | null;
  historyWarning: string | null;
  savedAt: string | null;
  versions: QuoteRecoverySnapshot[];
  paused: boolean;
};
export const INITIAL_RECOVERY_STATE: QuoteRecoveryState = {
  status: "loading", dirty: false, error: null, historyWarning: null, savedAt: null, versions: [], paused: false,
};

export function browserSaveError(error: unknown) {
  if (error instanceof Error && (error.name === "QuotaExceededError" || error.name === "SecurityError")) {
    return "Not saved. Browser storage is full or unavailable. Keep this page open and try again. Do not clear browser data.";
  }
  return error instanceof Error ? error.message : "The quote was not saved. Keep this page open and try again.";
}

function historyStorageError(error: unknown) {
  return error instanceof Error && (error.name === "QuotaExceededError" || error.name === "SecurityError")
    ? "Browser recovery storage is full or unavailable."
    : error instanceof Error ? error.message : "Browser recovery storage is unavailable.";
}

type RecoverySessionOptions = {
  quote: QuoteRecord;
  savedProposal: SavedProposalRecord | null;
  storage: WorkspaceStorage;
  history: QuoteRecoveryStore;
  withLock: <T>(action: () => Promise<T>) => Promise<T>;
  onSave: (request: RecoverySaveRequest) => RecoverySaveResult | null | Promise<RecoverySaveResult | null>;
  onRecover: (quote: QuoteRecord) => void;
  onChange: (state: QuoteRecoveryState) => void;
  debounceMs?: number;
  startPaused?: boolean;
};

// The session owns one quote and one opened revision for its entire lifetime.
export class QuoteRecoverySession {
  private quote: QuoteRecord;
  private readonly quoteId: string;
  private expectedRevision: string | null;
  private savedKey: string | null;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<RecoverySaveResult | null> | null = null;
  private initializing = true;
  private state: QuoteRecoveryState;

  constructor(private readonly options: RecoverySessionOptions) {
    this.quote = structuredClone(options.quote);
    this.quoteId = recoveryQuoteId(this.quote);
    if (!this.quoteId || (options.savedProposal && options.savedProposal.id !== this.quoteId)) throw new Error("The editor and saved quote do not match. Reopen this quote from Workspace.");
    this.expectedRevision = getProposalRevision(options.savedProposal);
    this.savedKey = options.savedProposal ? quoteContentKey(options.savedProposal.quote) : null;
    this.state = { ...INITIAL_RECOVERY_STATE, dirty: options.startPaused || quoteContentKey(this.quote) !== this.savedKey, paused: Boolean(options.startPaused), savedAt: options.savedProposal?.updatedAt ?? null };
  }

  getState() { return this.state; }

  private publish(patch: Partial<QuoteRecoveryState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.state);
  }

  async start() {
    try {
      assertProposalRevision(this.options.storage, this.quoteId, this.expectedRevision);
    } catch (error) { this.fail(error); return; }
    await this.refreshHistory();
    if (this.disposed || this.state.status === "conflict") return;
    this.initializing = false;
    this.publish({ status: this.state.paused ? "recovered" : this.state.dirty ? "pending" : "saved" });
    this.schedule();
  }

  private async refreshHistory() {
    try {
      const versions = await this.options.history.list(this.quoteId);
      if (isProposalDeleted(this.options.storage, this.quoteId)) throw new ProposalSaveConflict("deleted");
      this.publish({ versions, historyWarning: null });
    } catch (error) {
      if (error instanceof ProposalSaveConflict) this.fail(error);
      else this.publish({ historyWarning: `Recovery history unavailable. ${historyStorageError(error)}` });
    }
  }

  setQuote(quote: QuoteRecord) {
    if (this.disposed || recoveryQuoteId(quote) !== this.quoteId) return;
    if (quoteContentKey(quote) === quoteContentKey(this.quote)) return;
    this.quote = structuredClone(quote);
    const dirty = quoteContentKey(quote) !== this.savedKey;
    const blocked = this.state.paused || ["conflict", "error"].includes(this.state.status);
    this.publish({ dirty, status: blocked ? this.state.status : this.initializing ? "loading" : this.saving ? "saving" : dirty ? "pending" : "saved" });
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (this.disposed || this.initializing || !this.state.dirty || this.state.paused || this.saving || ["conflict", "error", "loading"].includes(this.state.status)) return;
    this.timer = setTimeout(() => { void this.saveNow("autosave"); }, this.options.debounceMs ?? 1200);
  }

  private fail(error: unknown) {
    clearTimeout(this.timer);
    this.publish({ status: error instanceof ProposalSaveConflict ? "conflict" : "error", error: browserSaveError(error), dirty: true });
  }

  checkForExternalChange() {
    if (this.disposed || this.saving) return;
    try { assertProposalRevision(this.options.storage, this.quoteId, this.expectedRevision); }
    catch (error) { this.fail(error); }
  }

  private async snapshot(quote: QuoteRecord, reason: RecoveryReason) {
    try {
      if (isProposalDeleted(this.options.storage, this.quoteId)) throw new ProposalSaveConflict("deleted");
      await this.options.history.append(createRecoverySnapshot(quote, reason));
      this.publish({ historyWarning: null });
    } catch (error) {
      if (error instanceof ProposalSaveConflict) throw error;
      this.publish({ historyWarning: `Recovery version not saved. ${historyStorageError(error)}` });
    }
  }

  saveNow(reason: "autosave" | "manual" = "manual"): Promise<RecoverySaveResult | null> {
    clearTimeout(this.timer);
    if (this.disposed || (reason === "autosave" && this.state.paused)) return Promise.resolve(null);
    if (this.saving) return this.saving;
    this.publish({ status: "saving", error: null });
    const operation = this.performSave(reason);
    this.saving = operation;
    void operation.finally(() => {
      this.saving = null;
      this.schedule();
    });
    return operation;
  }

  private async performSave(reason: "autosave" | "manual"): Promise<RecoverySaveResult | null> {
    try {
      return await this.options.withLock(async () => {
        if (this.disposed) return null;
        const opened = assertProposalRevision(this.options.storage, this.quoteId, this.expectedRevision);
        if (opened.proposal) await this.snapshot(opened.proposal.quote, "before-save");
        if (this.disposed) return null;
        // Capture after the history write, so typing while IndexedDB is busy is not overwritten.
        const input = structuredClone(this.quote);
        const inputKey = quoteContentKey(input);
        await this.snapshot(input, reason);
        if (this.disposed) return null;
        if (inputKey !== quoteContentKey(this.quote)) {
          this.publish({ status: "pending" });
          return null;
        }
        assertProposalRevision(this.options.storage, this.quoteId, this.expectedRevision);
        const result = await this.options.onSave({ quote: input, expectedRevision: this.expectedRevision, reason });
        if (!result || result.proposal.id !== this.quoteId || recoveryQuoteId(result.proposal.quote) !== this.quoteId) throw new Error("The Workspace save was not confirmed. Keep this page open and try again.");
        const revision = getProposalRevision(result.proposal);
        assertProposalRevision(this.options.storage, this.quoteId, revision);
        this.expectedRevision = revision;
        this.savedKey = quoteContentKey(result.proposal.quote);
        const currentKey = quoteContentKey(this.quote);
        const clean = currentKey === inputKey || currentKey === this.savedKey;
        if (clean) this.quote = structuredClone(result.proposal.quote);
        this.publish({ status: clean ? "saved" : "pending", dirty: !clean, savedAt: result.proposal.updatedAt, paused: false, error: null });
        // Listing failures are separate from a verified Workspace save.
        const warning = this.state.historyWarning;
        await this.refreshHistory();
        if (warning) this.publish({ historyWarning: warning });
        return result;
      });
    } catch (error) { this.fail(error); return null; }
  }

  async recover(versionId: string) {
    clearTimeout(this.timer);
    if (this.disposed || this.saving) return false;
    try {
      return await this.options.withLock(async () => {
        if (this.disposed) return false;
        assertProposalRevision(this.options.storage, this.quoteId, this.expectedRevision);
        const versions = await this.options.history.list(this.quoteId);
        const selected = versions.find((entry) => entry.id === versionId);
        const restored = readRecoveryQuote(selected, this.quoteId);
        if (!restored) throw new Error("This recovery version is damaged or no longer available.");
        await this.snapshot(this.quote, "before-recovery");
        if (this.disposed) return false;
        assertProposalRevision(this.options.storage, this.quoteId, this.expectedRevision);
        this.quote = restored;
        this.publish({ status: "recovered", paused: true, dirty: true, error: null });
        this.options.onRecover(structuredClone(restored));
        await this.refreshHistory();
        return true;
      });
    } catch (error) { this.fail(error); return false; }
  }

  async prepareToLeave(confirmRecovered: () => boolean | Promise<boolean>): Promise<boolean> {
    if (this.disposed || this.initializing) return false;
    if (!this.state.dirty && !this.saving && !this.state.paused) return true;
    if (this.state.paused && !await confirmRecovered()) return false;
    if (this.disposed) return false;
    const result = await this.saveNow(this.state.paused ? "manual" : "autosave");
    // New edits or unmounting during a pending write must not authorize navigation.
    return Boolean(result && !this.disposed && !this.state.dirty && !this.state.paused && this.state.status === "saved");
  }

  dispose() { this.disposed = true; clearTimeout(this.timer); }
}

import type { QuoteRecord } from "./quote-record";
import { PROPOSAL_STORE_KEY, deserializeProposalStore, serializeProposalStore, upsertProposal, type ProposalOwner, type ProposalStoreData, type SavedProposalRecord } from "./proposal-store";
import { scopeStorageKey } from "./app-environment";

export const PROPOSAL_WRITE_LOCK = scopeStorageKey("rapidquote:workspace-write");
const DELETED_PROPOSAL_PREFIX = scopeStorageKey("rapidquote:deleted-proposal:");
export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

export class ProposalSaveConflict extends Error {
  constructor(public readonly reason: "changed" | "deleted") {
    super(reason === "deleted"
      ? "This quote was deleted in another tab. It has not been saved again."
      : "This quote changed in another tab. Your changes in this tab are not saved. Keep this tab open and compare your changes with the latest saved quote in a new tab.");
    this.name = "ProposalSaveConflict";
  }
}

export function deletedProposalKey(proposalId: string) {
  return `${DELETED_PROPOSAL_PREFIX}${encodeURIComponent(proposalId)}`;
}

export function isProposalDeleted(storage: Pick<Storage, "getItem">, proposalId: string) {
  // Any value is treated as a deletion marker, including malformed values.
  return storage.getItem(deletedProposalKey(proposalId)) !== null;
}

export function markProposalDeleted(storage: WorkspaceStorage, proposalId: string) {
  const key = deletedProposalKey(proposalId);
  storage.setItem(key, "deleted");
  if (storage.getItem(key) !== "deleted") throw new Error("The quote deletion could not be verified.");
}

export function readWorkspaceStore(storage: Pick<Storage, "getItem">) {
  const raw = storage.getItem(PROPOSAL_STORE_KEY);
  if (raw === null) return null;
  const parsed = deserializeProposalStore(raw);
  const unreadable = () => new Error("Saved quotes could not be read. Keep this page open and recover browser storage before saving again.");
  if (!parsed) throw unreadable();
  const input = JSON.parse(raw) as ProposalStoreData;
  // The ordinary reader drops damaged records. A writer must never silently erase them.
  if (input.proposals.length !== parsed.proposals.length || new Set(parsed.proposals.map((p) => p.id)).size !== parsed.proposals.length) throw unreadable();
  return parsed;
}

export function getProposalRevision(proposal: SavedProposalRecord | null | undefined): string | null {
  if (!proposal) return null;
  // Normalize the same way as Workspace, then sort object keys for an exact (not hashed) token.
  const normalized = deserializeProposalStore(JSON.stringify({ currentUser: proposal.owner, users: [], proposals: [proposal] }))?.proposals[0];
  if (!normalized) throw new Error("The saved quote revision could not be read.");
  return JSON.stringify(normalized, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}

export function assertProposalRevision(storage: Pick<Storage, "getItem">, proposalId: string, expectedRevision: string | null) {
  if (isProposalDeleted(storage, proposalId)) throw new ProposalSaveConflict("deleted");
  const store = readWorkspaceStore(storage);
  const proposal = store?.proposals.find((entry) => entry.id === proposalId) ?? null;
  if (!proposal && expectedRevision !== null) throw new ProposalSaveConflict("deleted");
  if (getProposalRevision(proposal) !== expectedRevision) throw new ProposalSaveConflict("changed");
  return { store, proposal };
}

export async function withWorkspaceSaveLock<T>(action: () => T | Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("Safe browser saving is unavailable. Open RapidQuote in a current Edge or Chrome browser over HTTPS and try again.");
  }
  return navigator.locks.request(PROPOSAL_WRITE_LOCK, { mode: "exclusive" }, action);
}

export function assignQuoteOwner(quote: QuoteRecord, owner: ProposalOwner) {
  quote.metadata.ownerUserId = owner.id;
  quote.metadata.ownerName = owner.name;
  quote.internal.workspaceOwnerId = owner.id;
  quote.internal.workspaceOwnerName = owner.name;
  quote.internal.crmOwnerLabel = owner.name;
  return quote;
}

export function isProposalOwner(owner: ProposalOwner, user: ProposalOwner) {
  return owner.id === user.id || Boolean(owner.email.trim() && owner.email.trim().toLowerCase() === user.email.trim().toLowerCase());
}

// Workspace is the durable record. Validate its read path before reporting success.
export function saveProposalToWorkspace(storage: WorkspaceStorage, store: ProposalStoreData, proposal: SavedProposalRecord, options: { expectedRevision?: string | null } = {}) {
  if (isProposalDeleted(storage, proposal.id)) throw new ProposalSaveConflict("deleted");
  const latest = readWorkspaceStore(storage);
  if (options.expectedRevision !== undefined) assertProposalRevision(storage, proposal.id, options.expectedRevision);
  const previous = latest?.proposals.find((entry) => entry.id === proposal.id);
  const nextProposal = { ...proposal, recordVersion: (previous?.recordVersion ?? 0) + 1 };
  // Merge into the current disk store, not a stale tab's copy of other quotes.
  const nextStore = upsertProposal({ ...(latest ?? store), currentUser: store.currentUser }, nextProposal);
  const serialized = serializeProposalStore(nextStore);
  const readable = deserializeProposalStore(serialized);
  if (!readable?.proposals.some((entry) => entry.id === proposal.id)) {
    throw new Error("The quote could not be saved. Check that it has a quote number and try again.");
  }
  storage.setItem(PROPOSAL_STORE_KEY, serialized);
  if (storage.getItem(PROPOSAL_STORE_KEY) !== serialized) {
    throw new Error("The quote save could not be verified. Please try saving again.");
  }
  proposal.recordVersion = nextProposal.recordVersion;
  return nextStore;
}

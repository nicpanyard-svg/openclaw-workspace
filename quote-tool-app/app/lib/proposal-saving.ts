import type { QuoteRecord } from "./quote-record";
import { PROPOSAL_STORE_KEY, deserializeProposalStore, serializeProposalStore, upsertProposal, type ProposalOwner, type ProposalStoreData, type SavedProposalRecord } from "./proposal-store";

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
export function saveProposalToWorkspace(storage: Pick<Storage, "getItem" | "setItem">, store: ProposalStoreData, proposal: SavedProposalRecord) {
  const nextStore = upsertProposal(store, proposal);
  const serialized = serializeProposalStore(nextStore);
  const readable = deserializeProposalStore(serialized);
  if (!readable?.proposals.some((entry) => entry.id === proposal.id)) {
    throw new Error("The quote could not be saved. Check that it has a quote number and try again.");
  }
  storage.setItem(PROPOSAL_STORE_KEY, serialized);
  if (storage.getItem(PROPOSAL_STORE_KEY) !== serialized) {
    throw new Error("The quote save could not be verified. Please try saving again.");
  }
  return nextStore;
}

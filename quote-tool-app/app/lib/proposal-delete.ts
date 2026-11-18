import {
  ACTIVE_PROPOSAL_ID_KEY,
  PROPOSAL_STORE_KEY,
  getActiveProposalId,
  removeProposal,
  serializeProposalStore,
} from "@/app/lib/proposal-store";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  deserializeQuoteRecord,
} from "@/app/lib/proposal-state";
import { deletedProposalKey, markProposalDeleted, readWorkspaceStore } from "./proposal-saving";
import { createIndexedDbRecoveryStore } from "./quote-recovery";

export function deleteProposalFromBrowserState(proposalId: string) {
  if (typeof window === "undefined") return null;

  const savedStore = readWorkspaceStore(window.localStorage);
  if (!savedStore) return null;

  const existingProposal = savedStore.proposals.find((proposal) => proposal.id === proposalId);
  if (!existingProposal) return null;

  const preferredActiveProposalId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
  const nextStore = removeProposal(savedStore, proposalId);
  const nextActiveProposalId = getActiveProposalId(
    nextStore,
    preferredActiveProposalId === proposalId ? null : preferredActiveProposalId,
  );

  const markerKey = deletedProposalKey(proposalId);
  const previousMarker = window.localStorage.getItem(markerKey);
  markProposalDeleted(window.localStorage, proposalId);
  try {
    const serialized = serializeProposalStore(nextStore);
    window.localStorage.setItem(PROPOSAL_STORE_KEY, serialized);
    if (window.localStorage.getItem(PROPOSAL_STORE_KEY) !== serialized) throw new Error("The quote deletion could not be verified.");
  } catch (error) {
    // A failed deletion must not lock the still-existing quote out of future saves.
    if (previousMarker === null) window.localStorage.removeItem(markerKey);
    throw error;
  }
  void createIndexedDbRecoveryStore().remove(proposalId).catch(() => { /* The deletion marker still blocks recovery and saves. */ });
  if (nextActiveProposalId) {
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, nextActiveProposalId);
  } else {
    window.localStorage.removeItem(ACTIVE_PROPOSAL_ID_KEY);
  }

  const persistedQuote = deserializeQuoteRecord(
    window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY) ?? window.localStorage.getItem(PROPOSAL_STORAGE_FALLBACK_KEY),
  );
  const persistedProposalId = persistedQuote?.internal.savedProposalId ?? persistedQuote?.internal.quoteId ?? null;
  if (persistedProposalId === proposalId) {
    window.sessionStorage.removeItem(PROPOSAL_STORAGE_KEY);
    window.localStorage.removeItem(PROPOSAL_STORAGE_FALLBACK_KEY);
  }

  return {
    deletedProposal: existingProposal,
    nextStore,
    nextActiveProposalId,
  };
}

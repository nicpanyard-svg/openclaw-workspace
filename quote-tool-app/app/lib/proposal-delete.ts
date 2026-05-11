import {
  ACTIVE_PROPOSAL_ID_KEY,
  PROPOSAL_STORE_KEY,
  deserializeProposalStore,
  getActiveProposalId,
  removeProposal,
  serializeProposalStore,
} from "@/app/lib/proposal-store";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  deserializeQuoteRecord,
} from "@/app/lib/proposal-state";

export function deleteProposalFromBrowserState(proposalId: string) {
  if (typeof window === "undefined") return null;

  const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
  if (!savedStore) return null;

  const existingProposal = savedStore.proposals.find((proposal) => proposal.id === proposalId);
  if (!existingProposal) return null;

  const preferredActiveProposalId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
  const nextStore = removeProposal(savedStore, proposalId);
  const nextActiveProposalId = getActiveProposalId(
    nextStore,
    preferredActiveProposalId === proposalId ? null : preferredActiveProposalId,
  );

  window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
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

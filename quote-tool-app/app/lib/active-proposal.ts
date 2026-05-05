import type { QuoteRecord } from "@/app/lib/quote-record";
import {
  ACTIVE_PROPOSAL_ID_KEY,
  PROPOSAL_STORE_KEY,
  createProposalFromQuote,
  deserializeProposalStore,
  getActiveProposal,
  getProposalById,
  getDefaultProposalStore,
  mockUsers,
  serializeProposalStore,
  statusToStageLabel,
  upsertProposal,
  type SavedProposalRecord,
} from "@/app/lib/proposal-store";
import {
  PROPOSAL_STORAGE_FALLBACK_KEY,
  PROPOSAL_STORAGE_KEY,
  deserializeQuoteRecord,
  persistQuoteRecord,
} from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import { ensureNickTrainingDemoProposalStore } from "@/app/lib/nick-training-demo";
import { createBlankQuoteRecord } from "@/app/lib/quote-template";

function quoteMatchesProposal(quote: QuoteRecord | null, proposal: SavedProposalRecord | null) {
  if (!quote || !proposal) return false;

  const quoteProposalId = quote.internal?.savedProposalId ?? quote.internal?.quoteId ?? null;
  return quoteProposalId === proposal.id;
}

export function resolvePreferredQuote(options: {
  savedQuote?: QuoteRecord | null;
  activeProposal?: SavedProposalRecord | null;
  fallbackQuote?: QuoteRecord;
}): {
  quote: QuoteRecord;
  source: "session" | "proposal" | "fallback";
} {
  const savedQuote = options.savedQuote ?? null;
  const activeProposal = options.activeProposal ?? null;

  if (activeProposal && quoteMatchesProposal(savedQuote, activeProposal)) {
    return {
      quote: savedQuote as QuoteRecord,
      source: "session" as const,
    };
  }

  if (activeProposal) {
    return {
      quote: activeProposal.quote,
      source: "proposal" as const,
    };
  }

  if (savedQuote) {
    return {
      quote: savedQuote,
      source: "session" as const,
    };
  }

  return {
    quote: options.fallbackQuote ?? createBlankQuoteRecord(),
    source: "fallback" as const,
  };
}

export function resolveActiveProposalQuote(preferredProposalId?: string | null): {
  quote: QuoteRecord | null;
  usingSavedData: boolean;
  requestedProposalId: string | null;
  missingRequestedProposal: boolean;
  activeProposalId: string | null;
  activeProposal: SavedProposalRecord | null;
} {
  if (typeof window === "undefined") {
    return {
      quote: null,
      usingSavedData: false,
      requestedProposalId: preferredProposalId ?? null,
      missingRequestedProposal: false,
      activeProposalId: null,
      activeProposal: null,
    };
  }

  const savedQuote = deserializeQuoteRecord(
    window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY) ?? window.localStorage.getItem(PROPOSAL_STORAGE_FALLBACK_KEY),
  );
  const activeId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
  const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
  const fallbackStore = getDefaultProposalStore(
    createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }),
  );
  const store = ensureNickTrainingDemoProposalStore(savedStore ?? fallbackStore);
  const requestedProposalId = preferredProposalId ?? null;

  window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(store));

  const requestedProposal = requestedProposalId
    ? getProposalById(store, requestedProposalId)
    : null;
  const activeProposal = requestedProposal ?? getActiveProposal(store, activeId);
  const missingRequestedProposal = Boolean(requestedProposalId && !activeProposal);
  const resolvedId = activeProposal?.id ?? null;

  if (resolvedId) {
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, resolvedId);
  }

  if (missingRequestedProposal) {
    return {
      quote: null,
      usingSavedData: false,
      requestedProposalId,
      missingRequestedProposal,
      activeProposalId: null,
      activeProposal: null,
    };
  }

  if (requestedProposal) {
    persistQuoteRecord(requestedProposal.quote);

    return {
      quote: requestedProposal.quote,
      usingSavedData: true,
      requestedProposalId,
      missingRequestedProposal: false,
      activeProposalId: requestedProposal.id,
      activeProposal: requestedProposal,
    };
  }

  const { quote } = resolvePreferredQuote({
    savedQuote,
    activeProposal,
    fallbackQuote: createBlankQuoteRecord(),
  });

  persistQuoteRecord(quote);

  return {
    quote,
    usingSavedData: Boolean(activeProposal || savedQuote),
    requestedProposalId,
    missingRequestedProposal,
    activeProposalId: resolvedId,
    activeProposal,
  };
}

export function persistPreviewQuote(quote: QuoteRecord, options?: { proposalId?: string | null }) {
  if (typeof window === "undefined") return;

  const targetProposalId = options?.proposalId
    ?? quote.internal.savedProposalId
    ?? quote.internal.quoteId
    ?? window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
  const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
  const activeProposal = savedStore ? getProposalById(savedStore, targetProposalId) : null;
  const nextTouchedAt = new Date().toISOString();
  const preservedStatus = activeProposal?.status ?? quote.metadata.status;
  const nextQuote: QuoteRecord = {
    ...quote,
    metadata: {
      ...quote.metadata,
      status: preservedStatus,
      lastTouchedAt: nextTouchedAt,
    },
    internal: {
      ...quote.internal,
      quoteStatus: preservedStatus,
    },
  };

  persistQuoteRecord(nextQuote);

  if (!savedStore || !activeProposal) return;

  const updatedProposal: SavedProposalRecord = {
    ...activeProposal,
    quote: nextQuote,
    updatedAt: nextTouchedAt,
    status: activeProposal.status,
    stageLabel: activeProposal.stageLabel || statusToStageLabel(activeProposal.status),
  };

  const nextStore = upsertProposal(savedStore, updatedProposal);
  window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, activeProposal.id);
  window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
}

import type { QuoteRecord } from "@/app/lib/quote-record";
import {
  ACTIVE_PROPOSAL_ID_KEY,
  PROPOSAL_STORE_KEY,
  createProposalFromQuote,
  deserializeProposalStore,
  getActiveProposal,
  getDefaultProposalStore,
  mockUsers,
  serializeProposalStore,
  statusToStageLabel,
  upsertProposal,
  type SavedProposalRecord,
} from "@/app/lib/proposal-store";
import {
  PROPOSAL_STORAGE_KEY,
  deserializeQuoteRecord,
  serializeQuoteRecord,
} from "@/app/lib/proposal-state";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
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

export function resolveActiveProposalQuote(): {
  quote: QuoteRecord;
  usingSavedData: boolean;
  activeProposalId: string | null;
  activeProposal: SavedProposalRecord | null;
} {
  if (typeof window === "undefined") {
    return {
      quote: createBlankQuoteRecord(),
      usingSavedData: false,
      activeProposalId: null,
      activeProposal: null,
    };
  }

  const savedQuote = deserializeQuoteRecord(window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY));
  const activeId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
  const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
  const fallbackStore = getDefaultProposalStore(
    createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }),
  );
  const store = savedStore ?? fallbackStore;

  if (!savedStore) {
    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(store));
  }

  const activeProposal = getActiveProposal(store, activeId);
  const resolvedId = activeProposal?.id ?? null;

  if (resolvedId) {
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, resolvedId);
  }

  const { quote } = resolvePreferredQuote({
    savedQuote,
    activeProposal,
    fallbackQuote: createBlankQuoteRecord(),
  });

  window.sessionStorage.setItem(PROPOSAL_STORAGE_KEY, serializeQuoteRecord(quote));

  return {
    quote,
    usingSavedData: Boolean(activeProposal || savedQuote),
    activeProposalId: resolvedId,
    activeProposal,
  };
}

export function persistPreviewQuote(quote: QuoteRecord, options?: { markAsSent?: boolean }) {
  if (typeof window === "undefined") return;

  const nextStatus = options?.markAsSent ? "sent" : quote.metadata.status;
  const nextTouchedAt = new Date().toISOString();
  const nextQuote: QuoteRecord = {
    ...quote,
    metadata: {
      ...quote.metadata,
      status: nextStatus,
      lastTouchedAt: nextTouchedAt,
    },
    internal: {
      ...quote.internal,
      quoteStatus: nextStatus,
    },
  };

  window.sessionStorage.setItem(PROPOSAL_STORAGE_KEY, serializeQuoteRecord(nextQuote));

  const activeId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
  const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
  if (!savedStore) return;

  const activeProposal = getActiveProposal(savedStore, activeId);
  if (!activeProposal) return;

  const updatedProposal: SavedProposalRecord = {
    ...activeProposal,
    quote: nextQuote,
    updatedAt: nextTouchedAt,
    status: nextStatus,
    stageLabel: statusToStageLabel(nextStatus),
  };

  const nextStore = upsertProposal(savedStore, updatedProposal);
  window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
}

"use client";

import { useEffect, useState } from "react";
import { ProposalDetailView } from "@/app/components/proposal-workspace";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalFromQuote, deserializeProposalStore, getDefaultProposalStore, getProposalById, mockUsers, serializeProposalStore, type ProposalStoreData } from "@/app/lib/proposal-store";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export default function ProposalDetailClient({ proposalId }: { proposalId: string }) {
  const [store, setStore] = useState<ProposalStoreData | null>(null);

  useEffect(() => {
    const seed = createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] });
    const fallbackStore = getDefaultProposalStore(seed);

    if (typeof window === "undefined") {
      setStore(fallbackStore);
      return;
    }

    const saved = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const nextStore = saved ?? fallbackStore;

    if (!saved) {
      window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    }

    const resolvedProposal = getProposalById(nextStore, proposalId) ?? nextStore.proposals[0] ?? null;
    if (resolvedProposal) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, resolvedProposal.id);
    }

    setStore(nextStore);
  }, [proposalId]);

  if (!store) {
    return <main className="workspace-shell"><div className="workspace-empty">Loading proposal details…</div></main>;
  }

  const proposal = getProposalById(store, proposalId) ?? store.proposals[0];
  return <ProposalDetailView proposal={proposal} users={store.users} />;
}

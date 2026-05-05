"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ProposalDetailView } from "@/app/components/proposal-workspace";
import {
  ACTIVE_PROPOSAL_ID_KEY,
  PROPOSAL_STORE_KEY,
  createProposalFromQuote,
  deserializeProposalStore,
  getDefaultProposalStore,
  getProposalById,
  mockUsers,
  serializeProposalStore,
  type ProposalStoreData,
} from "@/app/lib/proposal-store";
import { ensureNickTrainingDemoProposalStore } from "@/app/lib/nick-training-demo";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

export default function ProposalDetailClient({ proposalId }: { proposalId: string }) {
  const store = useMemo<ProposalStoreData>(() => {
    const seed = createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] });
    const fallbackStore = getDefaultProposalStore(seed);

    if (typeof window === "undefined") {
      return fallbackStore;
    }

    const saved = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const nextStore = ensureNickTrainingDemoProposalStore(saved ?? fallbackStore);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));

    const resolvedProposal = getProposalById(nextStore, proposalId);
    if (resolvedProposal) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, resolvedProposal.id);
    }

    return nextStore;
  }, [proposalId]);

  const proposal = getProposalById(store, proposalId);

  if (!store) {
    return <main className="workspace-shell"><div className="workspace-empty">Loading proposal details...</div></main>;
  }

  if (!proposal) {
    return (
      <main className="workspace-shell">
        <div className="workspace-container detail-layout">
          <section className="workspace-hero detail-hero">
            <div>
              <div className="workspace-eyebrow">Internal proposal record</div>
              <h1 className="workspace-title">Proposal not found</h1>
              <p className="workspace-subtitle">Proposal {proposalId} is not available in local storage.</p>
            </div>
            <div className="workspace-actions">
              <Link href="/workspace" className="workspace-primary-button">Back to Workspace</Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return <ProposalDetailView proposal={proposal} users={store.users} />;
}

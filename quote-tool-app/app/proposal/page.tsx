"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { deserializeQuoteRecord, PROPOSAL_STORAGE_KEY, serializeQuoteRecord } from "@/app/lib/proposal-state";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalFromQuote, deserializeProposalStore, getActiveProposal, getDefaultProposalStore, mockUsers, serializeProposalStore } from "@/app/lib/proposal-store";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  const [quote, setQuote] = useState<QuoteRecord>(sampleQuoteRecord);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedQuote = deserializeQuoteRecord(window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY));
    const activeId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
    const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const fallbackStore = getDefaultProposalStore(createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] }));
    const store = savedStore ?? fallbackStore;

    if (!savedStore) {
      window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(store));
    }

    const activeProposal = getActiveProposal(store, activeId);
    const resolvedId = activeProposal?.id ?? null;

    if (resolvedId) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, resolvedId);
      setActiveProposalId(resolvedId);
    }

    if (savedQuote) {
      setQuote(savedQuote);
      setUsingSavedData(true);
      return;
    }

    if (activeProposal) {
      setQuote(activeProposal.quote);
      setUsingSavedData(true);
    }
  }, []);

  const printUrl = useMemo(() => {
    const payload = encodeURIComponent(serializeQuoteRecord(quote));
    return `/proposal/print?quote=${payload}`;
  }, [quote]);

  const handlePrintPdf = () => {
    try {
      const opened = window.open(printUrl, "_blank");

      if (!opened || opened.closed) {
        window.alert("Unable to open the print tab right now. If your browser blocked the new tab, allow popups/new tabs for this site and try again.");
        return;
      }

      try {
        opened.opener = null;
        opened.focus();
      } catch {
        // Ignore cross-browser focus/opener restrictions.
      }
    } catch {
      window.alert("Unable to open the print tab right now. If your browser blocked the new tab, allow popups/new tabs for this site and try again.");
    }
  };

  return (
    <div className="proposal-route-shell">
      <div className="proposal-toolbar no-print">
        <div>
          <div className="proposal-toolbar-label">Customer-facing document</div>
          <div className="proposal-toolbar-title">Preview Proposal</div>
          <div className="proposal-toolbar-subtitle">
            {usingSavedData
              ? "This is the actual proposal document generated from your saved proposal data."
              : "Previewing the current proposal document."}
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href="/" className="proposal-secondary-button">
            My Proposals
          </Link>
          <Link href="/new" className="proposal-secondary-button">
            Open Editor
          </Link>
          <button type="button" className="proposal-print-button" onClick={handlePrintPdf}>
            Print PDF
          </button>
        </div>
      </div>

      <div className="proposal-preview-shell">
        <div className="proposal-preview-pane-header no-print">
          <div className="proposal-toolbar-title proposal-preview-pane-title">Proposal document preview</div>
          <div className="proposal-toolbar-subtitle">This is the customer-facing proposal document. Use Print PDF to open the print-ready version and launch the browser print dialog right away.</div>
        </div>
        <ProposalDocument quote={quote} />
      </div>
    </div>
  );
}

export default ProposalPage;

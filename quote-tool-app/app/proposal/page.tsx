"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { deserializeQuoteRecord, PROPOSAL_STORAGE_KEY } from "@/app/lib/proposal-state";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalFromQuote, deserializeProposalStore, getActiveProposal, getDefaultProposalStore, mockUsers, serializeProposalStore } from "@/app/lib/proposal-store";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  const [quote, setQuote] = useState<QuoteRecord>(sampleQuoteRecord);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const proposalPdfFileName = useMemo(() => `${quote.metadata.proposalNumber || "proposal"}.pdf`, [quote.metadata.proposalNumber]);

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

  const handlePrintPdf = async () => {
    setPdfBusy(true);
    try {
      const response = await fetch("/api/proposal-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quote }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate proposal PDF");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      const printFrame = document.createElement("iframe");
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "0";
      printFrame.style.height = "0";
      printFrame.style.border = "0";
      printFrame.src = nextUrl;
      printFrame.onload = () => {
        const cleanup = () => {
          window.setTimeout(() => {
            URL.revokeObjectURL(nextUrl);
            printFrame.remove();
          }, 1000);
        };

        window.setTimeout(() => {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
          cleanup();
        }, 250);
      };
      document.body.appendChild(printFrame);
    } catch (error) {
      console.error(error);
      window.alert("Unable to generate the PDF right now.");
    } finally {
      setPdfBusy(false);
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
          <Link href={activeProposalId ? `/proposals/${activeProposalId}` : "/"} className="proposal-secondary-button">
            View Details
          </Link>
          <Link href="/new" className="proposal-secondary-button">
            Open Editor
          </Link>
          <button type="button" className="proposal-print-button" onClick={() => void handlePrintPdf()} disabled={pdfBusy}>
            {pdfBusy ? "Building PDF…" : "Print PDF"}
          </button>
        </div>
      </div>

      <div className="proposal-preview-shell">
        <div className="proposal-preview-pane-header no-print">
          <div className="proposal-toolbar-title proposal-preview-pane-title">Proposal document preview</div>
          <div className="proposal-toolbar-subtitle">This is the customer-facing proposal document. Use Print PDF to create the output from this proposal data.</div>
        </div>
        <ProposalDocument quote={quote} />
      </div>
    </div>
  );
}

export default ProposalPage;

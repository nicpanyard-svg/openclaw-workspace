"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { deserializeQuoteRecord, PROPOSAL_STORAGE_KEY } from "@/app/lib/proposal-state";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, createProposalFromQuote, deserializeProposalStore, getActiveProposal, getDefaultProposalStore, mockUsers, serializeProposalStore } from "@/app/lib/proposal-store";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  const [quote, setQuote] = useState<QuoteRecord>(sampleQuoteRecord);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

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

  useEffect(() => {
    let revokedUrl: string | null = null;

    const buildPdfPreview = async () => {
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
          throw new Error("Failed to generate PDF preview");
        }

        const blob = await response.blob();
        const nextUrl = URL.createObjectURL(blob);
        revokedUrl = nextUrl;
        setPdfUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      } catch (error) {
        console.error(error);
        setPdfUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
      } finally {
        setPdfBusy(false);
      }
    };

    buildPdfPreview();

    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [quote]);

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
          {pdfUrl ? (
            <a href={pdfUrl} download={`${quote.metadata.proposalNumber || "proposal"}.pdf`} className="proposal-print-button">
              Download PDF
            </a>
          ) : (
            <button type="button" className="proposal-print-button" disabled>
              {pdfBusy ? "Building PDF…" : "PDF unavailable"}
            </button>
          )}
          <button type="button" className="proposal-secondary-button" onClick={() => window.print()}>
            Print PDF
          </button>
        </div>
      </div>

      <div className="proposal-preview-layout">
        <div className="proposal-preview-pane">
          <div className="proposal-preview-pane-header no-print">
            <div className="proposal-toolbar-title proposal-preview-pane-title">PDF preview</div>
            <div className="proposal-toolbar-subtitle">
              Best check for what will be downloaded or printed.
            </div>
          </div>
          <div className="proposal-pdf-frame-shell">
            {pdfUrl ? (
              <iframe title="Proposal PDF preview" src={pdfUrl} className="proposal-pdf-frame" />
            ) : (
              <div className="proposal-pdf-frame-empty">{pdfBusy ? "Rendering PDF preview…" : "PDF preview unavailable."}</div>
            )}
          </div>
        </div>

        <div className="proposal-html-pane">
          <div className="proposal-preview-pane-header no-print">
            <div className="proposal-toolbar-title proposal-preview-pane-title">HTML preview</div>
            <div className="proposal-toolbar-subtitle">Live browser rendering of the same proposal content.</div>
          </div>
          <ProposalDocument quote={quote} />
        </div>
      </div>
    </div>
  );
}

export default ProposalPage;

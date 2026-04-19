"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  const [quote, setQuote] = useState<QuoteRecord>(sampleQuoteRecord);
  const [usingSavedData, setUsingSavedData] = useState(false);

  useEffect(() => {
    const resolved = resolveActiveProposalQuote();
    setQuote(resolved.quote);
    setUsingSavedData(resolved.usingSavedData);
    persistPreviewQuote(resolved.quote);
  }, []);

  const handlePrintPdf = () => {
    try {
      persistPreviewQuote(quote);
      const opened = window.open("/proposal/print", "_blank", "noopener,noreferrer");

      if (!opened) {
        window.alert("Unable to open the print tab right now. If your browser blocked the new tab, allow popups/new tabs for this site and try again.");
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

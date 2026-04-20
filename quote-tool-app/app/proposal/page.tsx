"use client";

import { useEffect, useState } from "react";
import { AuthGate } from "@/app/components/auth-shell";
import { ProposalDocument } from "@/app/components/proposal-document";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";
import { buildProposalWordHtml } from "@/app/lib/proposal-word-export";

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
    const nextQuote: QuoteRecord = {
      ...quote,
      metadata: {
        ...quote.metadata,
        status: "sent",
        lastTouchedAt: new Date().toISOString(),
      },
      internal: {
        ...quote.internal,
        quoteStatus: "sent",
      },
    };

    setQuote(nextQuote);
    persistPreviewQuote(nextQuote, { markAsSent: true });

    const opened = window.open("/proposal/print", "_blank");

    if (!opened) {
      window.alert("Unable to open the print tab right now. If your browser blocked the new tab, allow popups/new tabs for this site and try again.");
      return;
    }

    try {
      opened.opener = null;
    } catch {
      // Ignore cross-browser noopener assignment issues once the tab is already open.
    }
  };

  const handleExportWord = () => {
    const nextQuote: QuoteRecord = {
      ...quote,
      metadata: {
        ...quote.metadata,
        status: "sent",
        lastTouchedAt: new Date().toISOString(),
      },
      internal: {
        ...quote.internal,
        quoteStatus: "sent",
      },
    };

    setQuote(nextQuote);
    persistPreviewQuote(nextQuote, { markAsSent: true });

    const html = buildProposalWordHtml(nextQuote);
    const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeProposalNumber = nextQuote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";

    link.href = objectUrl;
    link.download = `${safeProposalNumber}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  return (
    <AuthGate>
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
            <button type="button" className="proposal-secondary-button" onClick={handleExportWord}>
              Export Word
            </button>
            <button type="button" className="proposal-print-button" onClick={handlePrintPdf}>
              Print PDF
            </button>
          </div>
        </div>

        <div className="proposal-preview-shell">
          <ProposalDocument quote={quote} />
        </div>
      </div>
    </AuthGate>
  );
}

export default ProposalPage;

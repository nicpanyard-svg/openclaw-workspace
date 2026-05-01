"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { AuthGate } from "@/app/components/auth-shell";
import { ProposalDocument } from "@/app/components/proposal-document";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { buildProposalWordDocument } from "@/app/lib/proposal-word-export";

function ProposalPage() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const resolved = useMemo(() => {
    if (!isHydrated) {
      return null;
    }

    const nextResolved = resolveActiveProposalQuote();
    persistPreviewQuote(nextResolved.quote);
    return nextResolved;
  }, [isHydrated]);
  const [quoteOverride, setQuoteOverride] = useState<QuoteRecord | null>(null);
  const quote = quoteOverride ?? resolved?.quote ?? null;
  const usingSavedData = resolved?.usingSavedData ?? false;

  const prepareSentQuote = (): QuoteRecord | null => {
    if (!quote) return null;

    return {
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
  };

  const generatePdfBlob = async (nextQuote: QuoteRecord) => {
    const response = await fetch("/api/proposal-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quote: nextQuote }),
    });

    if (!response.ok) {
      throw new Error("PDF generation failed.");
    }

    return response.blob();
  };

  const handleViewPdf = async () => {
    const nextQuote = prepareSentQuote();
    if (!nextQuote) return;

    setQuoteOverride(nextQuote);
    persistPreviewQuote(nextQuote, { markAsSent: true });

    try {
      const blob = await generatePdfBlob(nextQuote);
      const objectUrl = URL.createObjectURL(blob);
      const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

      if (!opened) {
        window.alert("Unable to open the PDF preview tab right now. Allow popups/new tabs for this site and try again.");
      }
    } catch {
      window.alert("Unable to generate the PDF preview right now. Please review the HTML preview and try again.");
    }
  };

  const handlePrintPdf = async () => {
    const nextQuote = prepareSentQuote();
    if (!nextQuote) return;

    setQuoteOverride(nextQuote);
    persistPreviewQuote(nextQuote, { markAsSent: true });

    try {
      const blob = await generatePdfBlob(nextQuote);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeProposalNumber = nextQuote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";

      link.href = objectUrl;
      link.download = `${safeProposalNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return;
    } catch {
      const opened = window.open("/proposal/print", "_blank");

      if (!opened) {
        window.alert("Unable to download the PDF or open the print tab right now. If your browser blocked the new tab, allow popups/new tabs for this site and try again.");
        return;
      }

      try {
        opened.opener = null;
      } catch {
        // Ignore cross-browser noopener assignment issues once the tab is already open.
      }
    }
  };

  const handleExportWord = async () => {
    const nextQuote = prepareSentQuote();
    if (!nextQuote) return;

    setQuoteOverride(nextQuote);
    persistPreviewQuote(nextQuote, { markAsSent: true });

    const blob = await buildProposalWordDocument(nextQuote);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeProposalNumber = nextQuote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";

    link.href = objectUrl;
    link.download = `${safeProposalNumber}.docx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  if (!quote || !resolved) {
    return <AuthGate><div className="proposal-route-shell"><div className="proposal-toolbar no-print"><div className="proposal-toolbar-title">Loading proposal preview…</div></div></div></AuthGate>;
  }

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
            <button type="button" className="proposal-secondary-button" onClick={() => void handleViewPdf()}>
              View PDF
            </button>
            <button type="button" className="proposal-print-button" onClick={() => void handlePrintPdf()}>
              Download PDF
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

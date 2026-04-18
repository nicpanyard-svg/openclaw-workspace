"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { deserializeQuoteRecord, PROPOSAL_STORAGE_KEY } from "@/app/lib/proposal-state";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  const [quote, setQuote] = useState<QuoteRecord>(sampleQuoteRecord);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const savedQuote = deserializeQuoteRecord(window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY));
    if (savedQuote) {
      setQuote(savedQuote);
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
          <div className="proposal-toolbar-title">Proposal</div>
          <div className="proposal-toolbar-subtitle">
            {usingSavedData ? "Using your latest quote details" : "Sample proposal"}
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href="/new" className="proposal-secondary-button">
            Back to Quote
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
            Browser Print
          </button>
        </div>
      </div>

      <div className="proposal-preview-layout">
        <div className="proposal-preview-pane">
          <div className="proposal-preview-pane-header no-print">
            <div className="proposal-toolbar-title proposal-preview-pane-title">PDF preview</div>
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
            <div className="proposal-toolbar-title proposal-preview-pane-title">Proposal</div>
          </div>
          <ProposalDocument quote={quote} />
        </div>
      </div>
    </div>
  );
}

export default ProposalPage;

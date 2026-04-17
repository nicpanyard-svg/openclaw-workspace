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

  useEffect(() => {
    const savedQuote = deserializeQuoteRecord(window.sessionStorage.getItem(PROPOSAL_STORAGE_KEY));
    if (savedQuote) {
      setQuote(savedQuote);
      setUsingSavedData(true);
    }
  }, []);

  return (
    <div className="proposal-route-shell">
      <div className="proposal-toolbar no-print">
        <div>
          <div className="proposal-toolbar-label">Customer-facing output</div>
          <div className="proposal-toolbar-title">Proposal print / PDF view</div>
          <div className="proposal-toolbar-subtitle">
            {usingSavedData ? "Using current builder data" : "Using sample proposal data"}
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href="/" className="proposal-secondary-button">
            Back to Builder
          </Link>
          <button type="button" className="proposal-print-button" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <ProposalDocument quote={quote} />
    </div>
  );
}

export default ProposalPage;

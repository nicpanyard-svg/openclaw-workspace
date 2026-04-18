"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PdfSigningPocPanel } from "@/app/components/pdf-signing-poc-panel";
import { ProposalDocument } from "@/app/components/proposal-document";
import { buildPdfSigningPlan } from "@/app/lib/pdf-signing-plan";
import { deserializeQuoteRecord, PROPOSAL_STORAGE_KEY } from "@/app/lib/proposal-state";
import type { QuoteRecord } from "@/app/lib/quote-record";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  const [quote, setQuote] = useState<QuoteRecord>(sampleQuoteRecord);
  const [usingSavedData, setUsingSavedData] = useState(false);
  const signingPlan = useMemo(() => buildPdfSigningPlan(quote), [quote]);

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
          <div className="proposal-toolbar-label">Proposal preview</div>
          <div className="proposal-toolbar-title">Proposal view</div>
          <div className="proposal-toolbar-subtitle">
            {usingSavedData ? "Using your latest quote details" : "Showing the sample proposal"}
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href="/new" className="proposal-secondary-button">
            Back to Quote
          </Link>
          <button type="button" className="proposal-print-button" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>
      </div>

      <PdfSigningPocPanel plan={signingPlan} />
      <ProposalDocument quote={quote} />
    </div>
  );
}

export default ProposalPage;

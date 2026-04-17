"use client";

import { ProposalDocument } from "@/app/components/proposal-document";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function ProposalPage() {
  return (
    <div className="proposal-route-shell">
      <div className="proposal-toolbar no-print">
        <div>
          <div className="proposal-toolbar-label">Customer-facing output</div>
          <div className="proposal-toolbar-title">Proposal print / PDF view</div>
        </div>
        <button type="button" className="proposal-print-button" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      <ProposalDocument quote={sampleQuoteRecord} />
    </div>
  );
}

export default ProposalPage;

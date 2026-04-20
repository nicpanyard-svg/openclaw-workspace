"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { ProposalPrintTrigger } from "@/app/components/proposal-print-trigger";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import type { QuoteRecord } from "@/app/lib/quote-record";

export function ProposalPrintClient() {
  const resolved = useMemo(() => {
    const nextResolved = resolveActiveProposalQuote();
    persistPreviewQuote(nextResolved.quote);
    return nextResolved;
  }, []);
  const [quote] = useState<QuoteRecord>(resolved.quote);

  return (
    <div className="proposal-route-shell proposal-print-shell">
      <ProposalPrintTrigger />
      <div className="proposal-toolbar no-print">
        <div>
          <div className="proposal-toolbar-label">Print-ready document</div>
          <div className="proposal-toolbar-title">Print Proposal</div>
          <div className="proposal-toolbar-subtitle">
            This uses the exact same proposal document and saved state as the HTML preview. The print dialog opens automatically once.
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href="/proposal" className="proposal-secondary-button">
            Back to Preview
          </Link>
        </div>
      </div>
      <ProposalDocument quote={quote} />
    </div>
  );
}

"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { ProposalPrintTrigger } from "@/app/components/proposal-print-trigger";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import type { QuoteRecord } from "@/app/lib/quote-record";

export function ProposalPrintClient() {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const quote = useMemo<QuoteRecord | null>(() => {
    if (!isHydrated) {
      return null;
    }

    const resolved = resolveActiveProposalQuote();
    persistPreviewQuote(resolved.quote);
    return resolved.quote;
  }, [isHydrated]);

  if (!quote) {
    return <div className="proposal-route-shell proposal-print-shell"><div className="proposal-toolbar no-print"><div className="proposal-toolbar-title">Loading print preview…</div></div></div>;
  }

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

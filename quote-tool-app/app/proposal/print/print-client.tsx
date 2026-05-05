"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProposalDocument } from "@/app/components/proposal-document";
import { ProposalPrintTrigger } from "@/app/components/proposal-print-trigger";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import { buildProposalPreviewPath } from "@/app/lib/proposal-navigation";

export function ProposalPrintClient({
  autoPrintOnly = false,
  requestedProposalId = null,
}: {
  autoPrintOnly?: boolean;
  requestedProposalId?: string | null;
}) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const resolved = useMemo(() => {
    if (!isHydrated) {
      return null;
    }

    const nextResolved = resolveActiveProposalQuote(requestedProposalId);
    if (nextResolved.quote && nextResolved.activeProposalId) {
      persistPreviewQuote(nextResolved.quote, { proposalId: nextResolved.activeProposalId });
    }
    return nextResolved;
  }, [isHydrated, requestedProposalId]);
  const quote = resolved?.quote ?? null;

  if (resolved?.missingRequestedProposal) {
    return (
      <div className="proposal-route-shell proposal-print-shell">
        <div className="proposal-toolbar no-print">
          <div>
            <div className="proposal-toolbar-label">Print-ready document</div>
            <div className="proposal-toolbar-title">Proposal not found</div>
            <div className="proposal-toolbar-subtitle">
              The requested proposal record could not be loaded, so print preview was blocked.
            </div>
          </div>
          <div className="proposal-toolbar-actions">
            <Link href="/workspace" className="proposal-secondary-button">
              Back to Workspace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!quote) {
    return <div className="proposal-route-shell proposal-print-shell"><div className="proposal-toolbar no-print"><div className="proposal-toolbar-title">Loading print preview...</div></div></div>;
  }

  return (
    <div className="proposal-route-shell proposal-print-shell">
      {autoPrintOnly ? <ProposalPrintTrigger /> : null}
      <div className="proposal-toolbar no-print">
        <div>
          <div className="proposal-toolbar-label">Print-ready document</div>
          <div className="proposal-toolbar-title">Print Proposal</div>
          <div className="proposal-toolbar-subtitle">
            This uses the exact same proposal document and saved state as the HTML preview. Use this page as the manual print fallback if direct PDF download is unavailable.
          </div>
        </div>
        <div className="proposal-toolbar-actions">
          <Link href={buildProposalPreviewPath(resolved?.activeProposalId ?? requestedProposalId)} className="proposal-secondary-button">
            Back to Preview
          </Link>
        </div>
      </div>
      <ProposalDocument quote={quote} />
    </div>
  );
}

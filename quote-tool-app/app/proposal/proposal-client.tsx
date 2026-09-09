"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "@/app/components/auth-shell";
import { ProposalDocument } from "@/app/components/proposal-document";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import { buildProposalPdfPreviewPath } from "@/app/lib/proposal-navigation";
import { assembleFinalProposalPdf } from "@/app/lib/proposal-spec-pdf-assembly";
import { buildProposalPdfFileName } from "@/app/lib/proposal-file-name";
import { QuoteExportMenu } from "@/app/components/quote-export-menu";
import { ArrowLeft, Eye, Presentation } from "lucide-react";
import dynamic from "next/dynamic";

const CustomerPresentation = dynamic(() => import("@/app/components/customer-presentation").then((module) => module.CustomerPresentation));

export function ProposalClient({ requestedProposalId = null }: { requestedProposalId?: string | null }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const pdfRequestRef = useRef<AbortController | null>(null);

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
  const activeProposalId = resolved?.activeProposalId ?? null;

  const requestBasePdfBlob = async () => {
    if (!quote) {
      throw new Error("No proposal is available for export.");
    }

    pdfRequestRef.current?.abort();
    const controller = new AbortController();
    pdfRequestRef.current = controller;

    try {
      const response = await fetch("/api/proposal-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ quote, proposalId: activeProposalId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("PDF generation failed.");
      }

      return response.blob();
    } finally {
      if (pdfRequestRef.current === controller) {
        pdfRequestRef.current = null;
      }
    }
  };

  const generatePdfBlob = async () => {
    if (!quote) {
      throw new Error("No proposal is available for export.");
    }

    const basePdfBlob = await requestBasePdfBlob();
    return assembleFinalProposalPdf(basePdfBlob, quote, { proposalId: quote.metadata.proposalNumber });
  };

  const handleViewPdf = async () => {
    if (!quote) return;
    window.location.assign(buildProposalPdfPreviewPath(activeProposalId));
  };

  const handlePrintPdf = async () => {
    if (!quote || isDownloading) return;
    setIsDownloading(true);
    setExportError(null);
    try {
      const blob = await generatePdfBlob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = buildProposalPdfFileName(quote);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PDF export failed.");
    } finally {
      setIsDownloading(false);
    }
  };


  if (!resolved) {
    return <AuthGate><div className="proposal-route-shell"><div className="proposal-toolbar no-print"><div className="proposal-toolbar-title">Loading proposal preview...</div></div></div></AuthGate>;
  }

  if (resolved.missingRequestedProposal) {
    return (
      <AuthGate>
        <div className="proposal-route-shell">
          <div className="proposal-toolbar no-print">
            <div>
              <div className="proposal-toolbar-label">App preview controls</div>
              <div className="proposal-toolbar-title">Proposal not found</div>
              <div className="proposal-toolbar-subtitle">
                The requested proposal record no longer exists in local storage, so preview and export were blocked.
              </div>
            </div>
            <div className="proposal-toolbar-actions">
              <Link href="/workspace" className="proposal-secondary-button">Back to Workspace</Link>
            </div>
          </div>
        </div>
      </AuthGate>
    );
  }

  if (!quote) {
    return <AuthGate><div className="proposal-route-shell"><div className="proposal-toolbar no-print"><div className="proposal-toolbar-title">Loading proposal preview...</div></div></div></AuthGate>;
  }

  return (
    <AuthGate>
      <div className="proposal-route-shell">
        {isPresenting && <CustomerPresentation quote={quote} onClose={() => setIsPresenting(false)} />}
        <div className="proposal-toolbar no-print">
          <div>
            <div className="proposal-toolbar-title">{quote.metadata.documentTitle || "Customer proposal"}</div>
            <div className="proposal-toolbar-subtitle">{quote.customer.name} / {quote.metadata.proposalNumber}</div>
          </div>
          <div className="proposal-toolbar-actions">
            <Link className="qe-button" href={activeProposalId ? `/new?proposalId=${encodeURIComponent(activeProposalId)}` : "/workspace"}><ArrowLeft size={16} />Back to quote</Link>
            <button type="button" className="qe-button" onClick={() => void handleViewPdf()}><Eye size={16} />PDF preview</button>
            <button type="button" className="qe-button" onClick={() => setIsPresenting(true)}><Presentation size={16} />Present</button>
            <QuoteExportMenu quote={quote} onPdf={handlePrintPdf} downloading={isDownloading} />
          </div>
        </div>

        {exportError && <div className="proposal-export-error no-print" role="alert">{exportError}</div>}
        <div className="proposal-preview-shell">
          <ProposalDocument quote={quote} />
        </div>
      </div>
    </AuthGate>
  );
}

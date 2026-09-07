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
import { buildProposalApprovalWorkbook } from "@/app/lib/proposal-xlsx-export";
import { QuoteMasterExport } from "@/app/components/quote-master-export";

export function ProposalClient({ requestedProposalId = null }: { requestedProposalId?: string | null }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
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
  const usingSavedData = resolved?.usingSavedData ?? false;
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

  const handleExportApprovalWorkbook = async () => {
    if (!quote) return;

    try {
      const { blob, fileName } = await buildProposalApprovalWorkbook(quote);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.alert("Unable to generate the approval workbook right now. Please try again.");
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
        <div className="proposal-toolbar no-print">
          <div>
            <div className="proposal-toolbar-label">App preview controls</div>
            <div className="proposal-toolbar-title">Proposal Preview</div>
            <div className="proposal-toolbar-subtitle">
              {usingSavedData
                ? "These controls are part of the app. The customer-facing proposal begins below and is the HTML source of truth used for PDF export."
                : "These controls are part of the app. The customer-facing proposal begins below."}
            </div>
          </div>
          <div className="proposal-toolbar-actions">
            {quote.metadata.workflowMode === "major_project" && <QuoteMasterExport quote={quote} />}
            <button type="button" className="proposal-secondary-button" onClick={() => void handleExportApprovalWorkbook()}>
              Export Approval Workbook
            </button>
            <button type="button" className="proposal-secondary-button" onClick={() => void handleViewPdf()}>
              Open PDF Preview
            </button>
            <button type="button" className="proposal-print-button" disabled={isDownloading} onClick={() => void handlePrintPdf()}>
              {isDownloading ? "Generating PDF..." : "Download PDF"}
            </button>
          </div>
        </div>

        {exportError && <div className="proposal-export-error no-print" role="alert">{exportError}</div>}
        <div className="proposal-preview-shell">
          <div className="proposal-preview-pane-header no-print">
            <div className="proposal-preview-pane-title">Customer proposal HTML</div>
            <div className="proposal-toolbar-subtitle">Everything below is customer-facing proposal content, not app chrome.</div>
          </div>
          <ProposalDocument quote={quote} />
        </div>
      </div>
    </AuthGate>
  );
}

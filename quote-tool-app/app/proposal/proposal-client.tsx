"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthGate } from "@/app/components/auth-shell";
import { ProposalDocument } from "@/app/components/proposal-document";
import { persistPreviewQuote, resolveActiveProposalQuote } from "@/app/lib/active-proposal";
import { buildProposalPrintPath } from "@/app/lib/proposal-navigation";
import { buildProposalApprovalWorkbook } from "@/app/lib/proposal-xlsx-export";

export function ProposalClient({ requestedProposalId = null }: { requestedProposalId?: string | null }) {
  const [isHydrated, setIsHydrated] = useState(false);
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

  const generatePdfBlob = async () => {
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

  const handleViewPdf = async () => {
    if (!quote) return;

    try {
      const blob = await generatePdfBlob();
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
    if (!quote) return;

    const safeProposalNumber = quote.metadata.proposalNumber.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "proposal";

    try {
      const blob = await generatePdfBlob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = objectUrl;
      link.download = `${safeProposalNumber}.pdf`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    } catch {
      try {
        const response = await fetch("/api/proposal-pdf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quote, proposalId: activeProposalId }),
        });

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = `${safeProposalNumber}.pdf`;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
          return;
        }
      } catch {
        // Fall through to print view backup.
      }

      const opened = window.open(buildProposalPrintPath(activeProposalId), "_blank");

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
              <div className="proposal-toolbar-label">Customer-facing document</div>
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
            <div className="proposal-toolbar-label">Customer-facing document</div>
            <div className="proposal-toolbar-title">Preview Proposal</div>
            <div className="proposal-toolbar-subtitle">
              {usingSavedData
                ? "This is the actual proposal document generated from your saved proposal data."
                : "Previewing the current proposal document."}
            </div>
          </div>
          <div className="proposal-toolbar-actions">
            <button type="button" className="proposal-secondary-button" onClick={() => void handleExportApprovalWorkbook()}>
              Export Approval XLSX
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

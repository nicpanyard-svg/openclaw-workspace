"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { buildCommercialMetrics } from "@/app/lib/commercial-model";
import { deleteProposalFromBrowserState } from "@/app/lib/proposal-delete";
import { buildProposalPreviewPath } from "@/app/lib/proposal-navigation";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, buildProposalSummary, createProposalCopy, deserializeProposalStore, serializeProposalStore, statusToStageLabel, upsertProposal, type ProposalOwner, type SavedProposalRecord } from "@/app/lib/proposal-store";
import { getWorkspaceQuoteSummary } from "@/app/lib/workspace-quote-summary";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: SavedProposalRecord["status"]) {
  switch (status) {
    case "in_review":
      return "workspace-badge workspace-badge-warn";
    case "approved":
      return "workspace-badge workspace-badge-success";
    case "sent":
      return "workspace-badge workspace-badge-info";
    case "booked":
      return "workspace-badge workspace-badge-muted";
    default:
      return "workspace-badge";
  }
}

function getNextStepLabel(proposal: SavedProposalRecord) {
  switch (proposal.status) {
    case "draft":
      return "Finish pricing and move it into review";
    case "in_review":
      return "Resolve review notes and approve it for release";
    case "approved":
      return "Send the approved quote to the customer or hand it off to Salesforce";
    case "sent":
      return "Follow up with the customer or manage the opportunity in Salesforce";
    case "booked":
      return "Hand the booked quote off to execution and CRM follow-through";
    default:
      return "Keep proposal moving";
  }
}

function confirmDeleteProposal(proposal: SavedProposalRecord) {
  if (typeof window === "undefined") return false;

  return window.confirm(
    `Delete proposal ${proposal.quote.metadata.proposalNumber} for ${proposal.quote.customer.name}? This removes it from the RapidQuote workspace.`,
  );
}

function WorkspaceReviewCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warn";
}) {
  const toneClass = tone === "accent"
    ? "commercial-metric-card-accent"
    : tone === "success"
      ? "commercial-metric-card-success"
      : tone === "warn"
        ? "commercial-metric-card-warn"
        : "";

  return (
    <div className={`commercial-metric-card workspace-review-card ${toneClass}`.trim()}>
      <span className="commercial-metric-label">{label}</span>
      <strong className="commercial-metric-value">{value}</strong>
      <p className="commercial-metric-detail">{detail}</p>
    </div>
  );
}

export { QuoteWorkspace as ProposalWorkspace } from "./quote-workspace";

export function ProposalDetailView({ proposal, users }: { proposal: SavedProposalRecord; users: ProposalOwner[] }) {
  const copyProposal = () => {
    if (typeof window === "undefined") return;

    const savedStore = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    if (!savedStore) return;

    const copiedProposal = createProposalCopy({
      proposal,
      owner: proposal.owner,
      currentUser: savedStore.currentUser,
      existingNumbers: savedStore.proposals.map((saved) => saved.quote.metadata.proposalNumber),
    });
    const nextStore = upsertProposal(savedStore, copiedProposal);

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, copiedProposal.id);
    window.location.href = `/new?proposalId=${copiedProposal.id}`;
  };
  const deleteProposal = () => {
    if (!confirmDeleteProposal(proposal)) return;

    const deletion = deleteProposalFromBrowserState(proposal.id);
    if (!deletion) return;

    window.location.href = "/workspace";
  };
  const summary = buildProposalSummary(proposal);
  const totals = getWorkspaceQuoteSummary(proposal.quote);
  const commercial = buildCommercialMetrics(proposal.quote);
  const isMajorProjectProposal = proposal.quote.metadata.workflowMode === "major_project" && Boolean(proposal.quote.majorProject?.enabled);
  const majorProjectTermMonths = proposal.quote.majorProject?.commercial.termMonths ?? 0;
  const latestActivity = proposal.activity[proposal.activity.length - 1] ?? null;
  const lastTouched = proposal.quote.metadata.lastTouchedAt ? formatDateTime(proposal.quote.metadata.lastTouchedAt) : formatDateTime(proposal.updatedAt);

  return (
    <main className="workspace-shell">
      <div className="workspace-container detail-layout">
        <section className="workspace-hero detail-hero">
          <div>
            <div className="workspace-eyebrow">Internal proposal record</div>
            <h1 className="workspace-title">{summary.title}</h1>
            <p className="workspace-subtitle">{summary.customerName} • {summary.proposalNumber}</p>
          </div>
          <div className="workspace-actions">
            <span className={statusTone(proposal.status)}>{proposal.stageLabel}</span>
            <button type="button" className="workspace-secondary-button" onClick={copyProposal}>Copy Proposal</button>
            <button type="button" className="danger-button" onClick={deleteProposal}>Delete</button>
            <Link href="/workspace" className="workspace-secondary-button">Quotes</Link>
            <Link href={buildProposalPreviewPath(proposal.id)} className="workspace-secondary-button">Preview Proposal</Link>
            <Link href={`/new?proposalId=${proposal.id}`} className="workspace-primary-button">Open Editor</Link>
          </div>
        </section>

        <section className="workspace-panel workspace-focus-panel">
          <div className="workspace-panel-topbar workspace-panel-topbar-stack">
            <div>
              <div className="workspace-eyebrow">Page purpose</div>
              <h2 className="workspace-section-title">Internal proposal workspace</h2>
              <p className="workspace-panel-copy">
                It shows ownership, status, totals, and history for the saved proposal. It is not the customer document.
                Keep the flow simple: start in <strong>Dashboard</strong>, use <strong>Open Editor</strong> to make changes, move to <strong>Preview Proposal</strong> to review the customer-facing document, then use <strong>Print PDF</strong> to open the print-ready page and launch the browser print dialog.
              </p>
            </div>
            <div className="workspace-focus-actions">
              <Link href={buildProposalPreviewPath(proposal.id)} className="workspace-secondary-button">Preview Proposal</Link>
              <Link href={`/new?proposalId=${proposal.id}`} className="workspace-primary-button workspace-primary-button-small">Open Editor</Link>
            </div>
          </div>
        </section>

        <section className="workspace-panel workspace-review-strip-panel">
          <div className="workspace-panel-topbar workspace-panel-topbar-stack">
            <div>
              <div className="workspace-eyebrow">Review surface</div>
              <h2 className="workspace-section-title">Commercial and release cues</h2>
              <p className="workspace-panel-copy">
                Use this strip to decide whether the proposal is ready for another pricing pass, internal review, or customer-facing preview.
              </p>
            </div>
          </div>

          <div className="workspace-review-strip">
            <WorkspaceReviewCard
              label="Current state"
              value={proposal.stageLabel}
              detail={statusToStageLabel(proposal.status)}
              tone={proposal.status === "approved" || proposal.status === "sent" ? "success" : proposal.status === "in_review" ? "accent" : "neutral"}
            />
            <WorkspaceReviewCard
              label="Next move"
              value={getNextStepLabel(proposal)}
              detail={latestActivity ? latestActivity.message : "No recent workflow activity recorded yet."}
              tone="accent"
            />
            <WorkspaceReviewCard
              label={isMajorProjectProposal ? "Contract margin" : "Gross margin"}
              value={`${commercial.totalGrossMarginPercent.toFixed(1)}%`}
              detail={`${isMajorProjectProposal ? "Contract GP" : "Gross profit"} ${formatCurrency(commercial.totalGrossProfit)}`}
              tone={commercial.totalGrossMarginPercent >= 25 ? "success" : commercial.totalGrossMarginPercent > 0 ? "accent" : "warn"}
            />
            <WorkspaceReviewCard
              label="Output path"
              value="Preview -> PDF -> Workbook"
              detail="Use Preview Proposal for the customer document, then launch print/PDF and workbook export from there."
            />
          </div>
        </section>

        <div className="detail-grid detail-grid-wide">
          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">At a glance</div>
                <h2 className="workspace-section-title">Proposal snapshot</h2>
              </div>
            </div>

            <div className="detail-card-grid">
              <div className="detail-card"><span>Status</span><strong>{proposal.stageLabel}</strong><em>{statusToStageLabel(proposal.status)}</em></div>
              <div className="detail-card"><span>Owner</span><strong>{proposal.owner.name}</strong><em>{proposal.owner.role}</em></div>
              <div className="detail-card"><span>Last touched</span><strong>{lastTouched}</strong><em>{latestActivity ? latestActivity.message : "No recent activity"}</em></div>
              <div className="detail-card"><span>Account Segment</span><strong>{proposal.workspace.accountSegment}</strong><em>{proposal.workspace.branchLabel}</em></div>
            </div>

            <div className="detail-table">
              <div><span>Account</span><strong>{proposal.quote.metadata.accountName ?? proposal.quote.customer.name}</strong></div>
              <div><span>Proposal date</span><strong>{proposal.quote.metadata.proposalDate}</strong></div>
              <div><span>Quote type</span><strong>{proposal.quote.metadata.quoteType}</strong></div>
              <div><span>Provider</span><strong>{proposal.quote.metadata.customerProvider}</strong></div>
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Commercial snapshot</div>
                <h2 className="workspace-section-title">Current totals</h2>
                <p className="workspace-panel-copy">
                  Keep the top-line numbers, margin, and contract basis readable here before you open the editor for line-by-line changes.
                </p>
              </div>
            </div>

            <div className="commercial-metric-grid workspace-commercial-grid">
              <WorkspaceReviewCard label="Monthly recurring" value={totals.monthly === null ? "Agreement required" : formatCurrency(totals.monthly)} detail={proposal.quote.metadata.quoteType === "lease" ? "Equipment lease and services" : "Included services"} tone="accent" />
              <WorkspaceReviewCard label="One-time charges" value={formatCurrency(totals.oneTime)} detail="Included equipment, services, and quoted tax" />
              <WorkspaceReviewCard label="Annual subscriptions" value={formatCurrency(totals.annualFirstYear)} detail={`Year 2 renewal: ${formatCurrency(totals.annualRenewal)}`} />
              <WorkspaceReviewCard label="Prepared by" value={proposal.quote.inet.contactName} detail={proposal.quote.inet.contactEmail} />
              <WorkspaceReviewCard label={isMajorProjectProposal ? "Contract gross profit" : "Gross profit"} value={formatCurrency(commercial.totalGrossProfit)} detail={isMajorProjectProposal && majorProjectTermMonths > 0 ? `${majorProjectTermMonths}-month contract basis` : "Internal only"} tone={commercial.totalGrossProfit >= 0 ? "success" : "warn"} />
              <WorkspaceReviewCard label={isMajorProjectProposal ? "Contract gross margin" : "Gross margin"} value={`${commercial.totalGrossMarginPercent.toFixed(1)}%`} detail={isMajorProjectProposal ? "MRR x months plus one-time value" : "Revenue vs cost"} tone={commercial.totalGrossMarginPercent >= 25 ? "success" : commercial.totalGrossMarginPercent > 0 ? "accent" : "warn"} />
              <WorkspaceReviewCard label="Recurring margin" value={`${commercial.recurringGrossMarginPercent.toFixed(1)}%`} detail={`Monthly GP ${formatCurrency(commercial.recurringGrossProfit)}`} tone={commercial.recurringGrossMarginPercent >= 25 ? "success" : commercial.recurringGrossMarginPercent > 0 ? "accent" : "warn"} />
              <WorkspaceReviewCard label="Option label" value={proposal.quote.commercial.meta.optionLabel} detail={proposal.quote.commercial.meta.comparisonGroup || "Internal comparison"} />
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Customer</div>
                <h2 className="workspace-section-title">Customer and delivery context</h2>
              </div>
            </div>

            <div className="detail-table">
              <div><span>Customer</span><strong>{proposal.quote.customer.name}</strong></div>
              <div><span>Contact</span><strong>{proposal.quote.customer.contactName}</strong></div>
              <div><span>Email</span><strong>{proposal.quote.customer.contactEmail}</strong></div>
              <div><span>Phone</span><strong>{proposal.quote.customer.contactPhone}</strong></div>
              <div><span>Bill to</span><strong>{proposal.quote.billTo.companyName}</strong></div>
              <div><span>Ship to</span><strong>{proposal.quote.shipTo.companyName}</strong></div>
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Record integrity</div>
                <h2 className="workspace-section-title">Workflow checkpoints</h2>
              </div>
            </div>

            <div className="detail-card-grid">
              <div className="detail-card"><span>Proposal ID</span><strong>{proposal.id}</strong><em>Internal saved record</em></div>
              <div className="detail-card"><span>Record version</span><strong>v{proposal.recordVersion}</strong><em>Local workspace data</em></div>
              <div className="detail-card"><span>Created by</span><strong>{proposal.createdBy.name}</strong><em>{formatDateTime(proposal.createdAt)}</em></div>
              <div className="detail-card"><span>Current owner label</span><strong>{proposal.quote.metadata.ownerName ?? proposal.owner.name}</strong><em>Shown in editor and preview</em></div>
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Team</div>
                <h2 className="workspace-section-title">Available owners</h2>
              </div>
            </div>
            <div className="owner-list">
              {users.map((user) => (
                <div key={user.id} className={`owner-list-card ${user.id === proposal.owner.id ? "owner-list-card-active" : ""}`}>
                  <strong>{user.name}</strong>
                  <span>{user.role}</span>
                  <em>{user.team}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Activity</div>
                <h2 className="workspace-section-title">Recent proposal history</h2>
              </div>
            </div>
            <div className="activity-list">
              {[...proposal.activity].slice().reverse().map((entry) => (
                <div key={entry.id} className="activity-item">
                  <div className="activity-dot" />
                  <div>
                    <strong>{entry.message}</strong>
                    <p>{entry.by.name} • {formatDateTime(entry.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

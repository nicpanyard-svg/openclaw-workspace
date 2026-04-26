"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { useAuth } from "@/app/components/auth-shell";
import type { AccessRequestRecord } from "@/app/lib/auth";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: AccessRequestRecord["status"]) {
  switch (status) {
    case "approved":
      return "workspace-badge workspace-badge-success";
    case "needs_info":
      return "workspace-badge workspace-badge-warn";
    case "denied":
      return "workspace-badge workspace-badge-muted";
    default:
      return "workspace-badge workspace-badge-info";
  }
}

export default function AccessPage() {
  const { user, accessRequests } = useAuth();

  const queue = useMemo(() => {
    if (user?.canManageUsers) return accessRequests;
    return accessRequests.filter((request) => request.email.toLowerCase() === user?.email.toLowerCase());
  }, [accessRequests, user]);

  const stats = useMemo(() => ({
    pending: queue.filter((request) => request.status === "pending").length,
    needsInfo: queue.filter((request) => request.status === "needs_info").length,
    approved: queue.filter((request) => request.status === "approved").length,
  }), [queue]);

  return (
    <main className="workspace-shell">
      <div className="workspace-container detail-layout">
        <section className="workspace-hero workspace-dashboard-hero">
          <div className="workspace-dashboard-hero-copy">
            <div className="workspace-brand-block workspace-dashboard-brand-block">
              <ProductLogo width={188} height={54} className="workspace-brand-logo product-logo workspace-queue-logo" priority />
              <div className="workspace-brand-heading-row workspace-dashboard-heading-row">
                <div>
                  <div className="workspace-eyebrow">Access and onboarding</div>
                  <h1 className="workspace-title">{user?.canManageUsers ? "Access queue" : "Your access status"}</h1>
                </div>
                <span className="workspace-user-chip">{user?.canManageUsers ? "Admin view" : "Requester view"}</span>
              </div>
            </div>
            <p className="workspace-subtitle">
              {user?.canManageUsers
                ? "This page gives RapidQuote a believable admin direction: who asked for access, what they need, and what should happen next before real provisioning is wired in."
                : "This page shows where your request stands, what review state it is in, and what the admin lane will eventually automate."}
            </p>
          </div>
          <div className="workspace-actions workspace-dashboard-actions">
            <Link href="/signup" className="workspace-secondary-button">New request</Link>
            <Link href="/" className="workspace-primary-button">Back to dashboard</Link>
          </div>
        </section>

        <section className="workspace-launchpad-grid">
          <div className="workspace-launchpad-card workspace-launchpad-card-primary">
            <div className="workspace-support-label">Pending review</div>
            <strong>{stats.pending}</strong>
            <p className="workspace-support-copy">Requests waiting on an admin decision or provisioning handoff.</p>
          </div>
          <div className="workspace-launchpad-card">
            <div className="workspace-support-label">Need more info</div>
            <strong>{stats.needsInfo}</strong>
            <p className="workspace-support-copy">Requests blocked on manager confirmation, scope clarification, or policy review.</p>
          </div>
          <div className="workspace-launchpad-card">
            <div className="workspace-support-label">Approved</div>
            <strong>{stats.approved}</strong>
            <p className="workspace-support-copy">Accounts ready for invite, activation, or backend provisioning work.</p>
          </div>
          <div className="workspace-launchpad-card">
            <div className="workspace-support-label">What backend adds next</div>
            <strong>Audit + provisioning</strong>
            <p className="workspace-support-copy">Directory sync, role grants, email delivery, and reviewer actions belong underneath this surface later.</p>
          </div>
        </section>

        <section className="workspace-panel workspace-focus-panel">
          <div className="workspace-panel-topbar workspace-panel-topbar-stack">
            <div>
              <div className="workspace-eyebrow">Product direction</div>
              <h2 className="workspace-section-title">How this should behave on top of real auth</h2>
              <p className="workspace-panel-copy">
                Requests should enter a durable queue, route to the right reviewer, preserve notes, enforce role boundaries, and notify the requester at each state change.
                This page now gives the product a visible place for all of that to happen.
              </p>
            </div>
          </div>
          <div className="detail-card-grid">
            <div className="detail-card">
              <span>Queue behavior</span>
              <strong>One review lane</strong>
              <em>Every signup request lands in one visible queue with timestamps, notes, and status.</em>
            </div>
            <div className="detail-card">
              <span>Admin actions</span>
              <strong>Approve, deny, request info</strong>
              <em>Those are the core states a backend workflow should support first.</em>
            </div>
            <div className="detail-card">
              <span>User experience</span>
              <strong>Always know next step</strong>
              <em>The requester should never wonder whether the system received the request or who owns it.</em>
            </div>
            <div className="detail-card">
              <span>Security posture</span>
              <strong>Internal-first access</strong>
              <em>External users stay outside the workspace until policy and tenant controls are ready.</em>
            </div>
          </div>
        </section>

        <section className="workspace-panel">
          <div className="workspace-panel-topbar workspace-panel-topbar-stack">
            <div>
              <div className="workspace-eyebrow">Current queue</div>
              <h2 className="workspace-section-title">Access requests</h2>
              <p className="workspace-panel-copy">
                This is the visible admin/requester surface for multi-user onboarding. It is intentionally product-complete even though the true workflow engine is still coming behind it.
              </p>
            </div>
          </div>

          <div className="workspace-list">
            {queue.map((request) => (
              <article key={request.id} className="proposal-list-card proposal-list-card-visual">
                <div className="proposal-list-topline">
                  <div className="proposal-list-topline-meta">
                    <div className="proposal-list-kicker">{request.id}</div>
                    <div className="proposal-list-updated">Requested {formatDateTime(request.createdAt)}</div>
                  </div>
                  <div className="proposal-list-status-cluster">
                    <span className={statusTone(request.status)}>{request.status.replace("_", " ")}</span>
                  </div>
                </div>

                <div className="proposal-list-head proposal-list-head-visual">
                  <div className="proposal-list-title-block">
                    <p className="proposal-list-customer">{request.name}</p>
                    <h3>{request.email}</h3>
                    <div className="proposal-list-meta-row">
                      <span className="proposal-owner-chip">{request.team}</span>
                      <span className="proposal-segment-chip">{request.roleNeeded}</span>
                    </div>
                  </div>
                </div>

                <div className="proposal-next-step-banner">
                  <span>Business reason</span>
                  <strong>{request.businessReason}</strong>
                </div>

                <div className="proposal-list-footer proposal-list-footer-visual">
                  <div className="proposal-list-note-block">
                    <div className="proposal-list-note-label">Review notes</div>
                    <div className="proposal-list-note">{request.notes ?? "No notes yet."}</div>
                    <div className="proposal-list-note proposal-list-note-secondary">
                      {request.reviewedAt && request.reviewerName
                        ? `Reviewed ${formatDateTime(request.reviewedAt)} by ${request.reviewerName}`
                        : "Awaiting admin review"}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!queue.length ? (
              <div className="workspace-group-empty">No access requests to show yet.</div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

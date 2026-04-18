"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, buildProposalSummary, createProposalFromQuote, deserializeProposalStore, getDefaultProposalStore, mockUsers, serializeProposalStore, statusToStageLabel, type ProposalOwner, type ProposalStoreData, type SavedProposalRecord } from "@/app/lib/proposal-store";
import { sampleQuoteRecord } from "@/app/lib/sample-quote-record";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function statusTone(status: SavedProposalRecord["status"]) {
  switch (status) {
    case "approved":
      return "workspace-badge workspace-badge-success";
    case "negotiating":
      return "workspace-badge workspace-badge-warn";
    case "sent":
    case "open":
      return "workspace-badge workspace-badge-info";
    case "closed":
      return "workspace-badge workspace-badge-muted";
    default:
      return "workspace-badge";
  }
}

export function ProposalWorkspace() {
  const [store, setStore] = useState<ProposalStoreData | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("mine");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    const seed = createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] });
    const fallbackStore = getDefaultProposalStore(seed);

    if (typeof window === "undefined") {
      setStore(fallbackStore);
      return;
    }

    const saved = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    if (saved) {
      setStore(saved);
      return;
    }

    window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(fallbackStore));
    setStore(fallbackStore);
  }, []);

  const proposals = useMemo(() => {
    if (!store) return [];

    return store.proposals.filter((proposal) => {
      const ownerMatch = ownerFilter === "all" ? true : proposal.owner.id === store.currentUser.id;
      const statusMatch = statusFilter === "all" ? true : proposal.status === statusFilter;
      return ownerMatch && statusMatch;
    });
  }, [ownerFilter, statusFilter, store]);

  const stats = useMemo(() => {
    if (!store) return { total: 0, mine: 0, active: 0, sent: 0 };

    return {
      total: store.proposals.length,
      mine: store.proposals.filter((proposal) => proposal.owner.id === store.currentUser.id).length,
      active: store.proposals.filter((proposal) => ["draft", "open", "negotiating"].includes(proposal.status)).length,
      sent: store.proposals.filter((proposal) => proposal.status === "sent").length,
    };
  }, [store]);

  const setActiveProposal = (proposalId: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, proposalId);
  };

  if (!store) {
    return <main className="workspace-shell"><div className="workspace-empty">Loading proposal workspace…</div></main>;
  }

  return (
    <main className="workspace-shell">
      <div className="workspace-container">
        <section className="workspace-hero">
          <div>
            <div className="workspace-eyebrow">RapidQuote</div>
            <h1 className="workspace-title">My Proposals</h1>
            <p className="workspace-subtitle">
              A clear proposal workspace with ownership, status, and the right next step for every quote.
            </p>
          </div>
          <div className="workspace-actions">
            <div className="workspace-current-user">
              <div className="workspace-user-label">Signed in as</div>
              <div className="workspace-user-name">{store.currentUser.name}</div>
              <div className="workspace-user-meta">{store.currentUser.role} • {store.currentUser.team}</div>
            </div>
            <Link href="/new" className="workspace-primary-button">+ New Proposal</Link>
          </div>
        </section>

        <section className="workspace-stat-grid">
          <div className="workspace-stat-card"><div className="workspace-stat-label">Total proposals</div><div className="workspace-stat-value">{stats.total}</div><div className="workspace-stat-note">Saved in this workspace</div></div>
          <div className="workspace-stat-card"><div className="workspace-stat-label">Assigned to me</div><div className="workspace-stat-value">{stats.mine}</div><div className="workspace-stat-note">Quotes currently in your lane</div></div>
          <div className="workspace-stat-card"><div className="workspace-stat-label">Active work</div><div className="workspace-stat-value">{stats.active}</div><div className="workspace-stat-note">Drafts and live negotiations in progress</div></div>
          <div className="workspace-stat-card"><div className="workspace-stat-label">Sent out</div><div className="workspace-stat-value">{stats.sent}</div><div className="workspace-stat-note">Waiting on customer review or follow-up</div></div>
        </section>

        <section className="workspace-panel">
          <div className="workspace-panel-topbar">
            <div>
              <div className="workspace-eyebrow">Dashboard</div>
              <h2 className="workspace-section-title">Proposal queue</h2>
            </div>
            <div className="workspace-filter-row">
              <label className="workspace-field compact">
                <span>Owner</span>
                <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                  <option value="mine">My proposals</option>
                  <option value="all">All owners</option>
                </select>
              </label>
              <label className="workspace-field compact">
                <span>Status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="open">Open</option>
                  <option value="negotiating">Negotiating</option>
                  <option value="approved">Approved</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
            </div>
          </div>

          <div className="workspace-list">
            {proposals.map((proposal) => {
              const summary = buildProposalSummary(proposal);
              return (
                <article key={proposal.id} className="proposal-list-card">
                  <div className="proposal-list-head">
                    <div>
                      <div className="proposal-list-kicker">{summary.proposalNumber}</div>
                      <h3>{summary.title}</h3>
                      <p>{summary.customerName}</p>
                    </div>
                    <span className={statusTone(proposal.status)}>{proposal.stageLabel || statusToStageLabel(proposal.status)}</span>
                  </div>

                  <div className="proposal-list-metrics">
                    <div><span>Owner</span><strong>{summary.ownerName}</strong></div>
                    <div><span>Monthly</span><strong>{formatCurrency(summary.totalMonthly)}</strong></div>
                    <div><span>Equipment</span><strong>{formatCurrency(summary.equipmentTotal)}</strong></div>
                    <div><span>Updated</span><strong>{formatDate(summary.updatedAt)}</strong></div>
                  </div>

                  <div className="proposal-list-footer">
                    <div className="proposal-list-note">Proposal detail and quote editor stay in sync</div>
                    <div className="proposal-list-actions">
                      <Link href={`/proposals/${proposal.id}`} className="workspace-secondary-button" onClick={() => setActiveProposal(proposal.id)}>
                        Open Detail
                      </Link>
                      <Link href="/new" className="workspace-primary-button workspace-primary-button-small" onClick={() => setActiveProposal(proposal.id)}>
                        Edit Proposal
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

export function ProposalDetailView({ proposal, users }: { proposal: SavedProposalRecord; users: ProposalOwner[] }) {
  const summary = buildProposalSummary(proposal);

  return (
    <main className="workspace-shell">
      <div className="workspace-container detail-layout">
        <section className="workspace-hero detail-hero">
          <div>
            <div className="workspace-eyebrow">Proposal Detail</div>
            <h1 className="workspace-title">{summary.title}</h1>
            <p className="workspace-subtitle">{summary.customerName} • {summary.proposalNumber}</p>
          </div>
          <div className="workspace-actions">
            <span className={statusTone(proposal.status)}>{proposal.stageLabel}</span>
            <Link href="/" className="workspace-secondary-button">Back to My Proposals</Link>
            <Link href="/new" className="workspace-primary-button">Open in Quote</Link>
          </div>
        </section>

        <div className="detail-grid">
          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Ownership</div>
                <h2 className="workspace-section-title">Proposal record</h2>
              </div>
            </div>

            <div className="detail-card-grid">
              <div className="detail-card"><span>Owner</span><strong>{proposal.owner.name}</strong><em>{proposal.owner.role}</em></div>
              <div className="detail-card"><span>Created by</span><strong>{proposal.createdBy.name}</strong><em>{formatDate(proposal.createdAt)}</em></div>
              <div className="detail-card"><span>Status</span><strong>{proposal.stageLabel}</strong><em>{proposal.status}</em></div>
              <div className="detail-card"><span>Workspace</span><strong>{proposal.workspace.accountSegment}</strong><em>{proposal.workspace.branchLabel}</em></div>
            </div>

            <div className="detail-table">
              <div><span>Account</span><strong>{proposal.quote.metadata.accountName ?? proposal.quote.customer.name}</strong></div>
              <div><span>Proposal date</span><strong>{proposal.quote.metadata.proposalDate}</strong></div>
              <div><span>Owner id</span><strong>{proposal.quote.metadata.ownerUserId ?? proposal.owner.id}</strong></div>
              <div><span>Last touched</span><strong>{proposal.quote.metadata.lastTouchedAt ? formatDate(proposal.quote.metadata.lastTouchedAt) : formatDate(proposal.updatedAt)}</strong></div>
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Commercial snapshot</div>
                <h2 className="workspace-section-title">Proposal totals</h2>
              </div>
            </div>

            <div className="detail-card-grid">
              <div className="detail-card"><span>Monthly recurring</span><strong>{formatCurrency(summary.totalMonthly)}</strong><em>Section A</em></div>
              <div className="detail-card"><span>Equipment</span><strong>{formatCurrency(summary.equipmentTotal)}</strong><em>Section B</em></div>
              <div className="detail-card"><span>Optional services</span><strong>{formatCurrency(summary.optionalServicesTotal)}</strong><em>Section C</em></div>
              <div className="detail-card"><span>Quote type</span><strong>{proposal.quote.metadata.quoteType}</strong><em>{proposal.quote.metadata.customerProvider}</em></div>
            </div>
          </section>

          <section className="workspace-panel">
            <div className="workspace-panel-topbar">
              <div>
                <div className="workspace-eyebrow">Team routing</div>
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
              {proposal.activity.map((entry) => (
                <div key={entry.id} className="activity-item">
                  <div className="activity-dot" />
                  <div>
                    <strong>{entry.message}</strong>
                    <p>{entry.by.name} • {formatDate(entry.at)}</p>
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

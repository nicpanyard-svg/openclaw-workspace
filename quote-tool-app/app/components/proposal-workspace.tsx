"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ACTIVE_PROPOSAL_ID_KEY, PROPOSAL_STORE_KEY, buildProposalSummary, createProposalFromQuote, deserializeProposalStore, getActiveProposalId, getDefaultProposalStore, getProposalById, mockUsers, serializeProposalStore, statusToStageLabel, type ProposalOwner, type ProposalStoreData, type SavedProposalRecord } from "@/app/lib/proposal-store";
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

function StatFilterCard({
  label,
  value,
  note,
  active,
  onClick,
}: {
  label: string;
  value: number;
  note: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`workspace-stat-card text-left transition ${active ? "ring-2 ring-[#b00000] bg-[#fff7f7]" : "hover:border-[#d8b7b7]"}`}
      aria-pressed={active}
    >
      <div className="workspace-stat-label">{label}</div>
      <div className="workspace-stat-value">{value}</div>
      <div className="workspace-stat-note">{note}</div>
    </button>
  );
}

export function ProposalWorkspace() {
  const [store, setStore] = useState<ProposalStoreData | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("mine");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);

  useEffect(() => {
    const seed = createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] });
    const fallbackStore = getDefaultProposalStore(seed);

    if (typeof window === "undefined") {
      setStore(fallbackStore);
      setActiveProposalId(fallbackStore.proposals[0]?.id ?? null);
      return;
    }

    const saved = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const nextStore = saved ?? fallbackStore;
    const savedActiveProposalId = window.localStorage.getItem(ACTIVE_PROPOSAL_ID_KEY);
    const resolvedActiveProposalId = getActiveProposalId(nextStore, savedActiveProposalId);

    if (!saved) {
      window.localStorage.setItem(PROPOSAL_STORE_KEY, serializeProposalStore(nextStore));
    }

    if (resolvedActiveProposalId) {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, resolvedActiveProposalId);
    }

    setStore(nextStore);
    setActiveProposalId(resolvedActiveProposalId);
  }, []);

  const proposals = useMemo(() => {
    if (!store) return [];

    return store.proposals.filter((proposal) => {
      const ownerMatch = ownerFilter === "all" ? true : proposal.owner.id === store.currentUser.id;
      const statusMatch = statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? ["draft", "open", "negotiating"].includes(proposal.status)
          : proposal.status === statusFilter;
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

  const activeProposal = useMemo(() => {
    if (!store) return null;
    return getProposalById(store, activeProposalId) ?? proposals[0] ?? store.proposals[0] ?? null;
  }, [activeProposalId, proposals, store]);

  const setActiveProposal = (proposalId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, proposalId);
    }
    setActiveProposalId(proposalId);
  };

  if (!store) {
    return <main className="workspace-shell"><div className="workspace-empty">Loading proposal workspace…</div></main>;
  }

  return (
    <main className="workspace-shell">
      <div className="workspace-container">
        <section className="workspace-hero">
          <div className="workspace-brand-block">
            <div className="workspace-brand-mark">
              <Image src="/inet-logo.png" alt="iNet logo" width={126} height={38} className="workspace-brand-logo" priority />
            </div>
            <div>
              <div className="workspace-eyebrow">RapidQuote</div>
              <h1 className="workspace-title">My Proposals</h1>
              <p className="workspace-subtitle">
                This is the internal list view. Pick a proposal, then open the editor to make changes or preview the customer-facing document when you are ready to review output.
              </p>
            </div>
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
          <StatFilterCard label="All proposals" value={stats.total} note="Show every saved proposal" active={ownerFilter === "all" && statusFilter === "all"} onClick={() => { setOwnerFilter("all"); setStatusFilter("all"); }} />
          <StatFilterCard label="Assigned to me" value={stats.mine} note="Show only proposals in your lane" active={ownerFilter === "mine" && statusFilter === "all"} onClick={() => { setOwnerFilter("mine"); setStatusFilter("all"); }} />
          <StatFilterCard label="Active work" value={stats.active} note={<>Show drafts, open deals, and<br />negotiations in progress</>} active={ownerFilter === "all" && statusFilter === "active"} onClick={() => { setOwnerFilter("all"); setStatusFilter("active"); }} />
          <StatFilterCard label="Sent out" value={stats.sent} note="Show proposals waiting on review" active={ownerFilter === "all" && statusFilter === "sent"} onClick={() => { setOwnerFilter("all"); setStatusFilter("sent"); }} />
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
                  <option value="active">Active</option>
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
              const isActive = proposal.id === activeProposal?.id;

              return (
                <article key={proposal.id} className={`proposal-list-card ${isActive ? "proposal-list-card-active" : ""}`}>
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

                  <div className="proposal-list-footer proposal-list-footer-stack">
                    <div className="proposal-list-note">{isActive ? "Ready to edit or preview" : "Choose edit or preview from this proposal"}</div>
                    <div className="proposal-list-actions">
                      <Link href="/proposal" className="workspace-secondary-button" onClick={() => setActiveProposal(proposal.id)}>
                        Preview Proposal
                      </Link>
                      <Link href="/new" className="workspace-primary-button workspace-primary-button-small" onClick={() => setActiveProposal(proposal.id)}>
                        Open Editor
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
            <Link href="/" className="workspace-secondary-button">Back to My Proposals</Link>
            <Link href="/proposal" className="workspace-secondary-button">Preview Proposal</Link>
            <Link href="/new" className="workspace-primary-button">Open Editor</Link>
          </div>
        </section>

        <section className="workspace-panel workspace-focus-panel">
          <div className="workspace-panel-topbar workspace-panel-topbar-stack">
            <div>
              <div className="workspace-eyebrow">Page purpose</div>
              <h2 className="workspace-section-title">This is the internal record page</h2>
              <p className="workspace-panel-copy">
                It shows ownership, status, totals, and history for the proposal record. It is not the customer document.
                When you want to see what the customer sees, use <strong>Preview Proposal</strong>. When you want to make changes, use <strong>Open Editor</strong>.
              </p>
            </div>
            <div className="workspace-focus-actions">
              <Link href="/proposal" className="workspace-secondary-button">Preview Proposal</Link>
              <Link href="/new" className="workspace-primary-button workspace-primary-button-small">Open Editor</Link>
            </div>
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
              </div>
            </div>

            <div className="detail-card-grid">
              <div className="detail-card"><span>Monthly recurring</span><strong>{formatCurrency(summary.totalMonthly)}</strong><em>Section A</em></div>
              <div className="detail-card"><span>Equipment</span><strong>{formatCurrency(summary.equipmentTotal)}</strong><em>Section B</em></div>
              <div className="detail-card"><span>Optional services</span><strong>{formatCurrency(summary.optionalServicesTotal)}</strong><em>Section C</em></div>
              <div className="detail-card"><span>Prepared by</span><strong>{proposal.quote.inet.contactName}</strong><em>{proposal.quote.inet.contactEmail}</em></div>
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

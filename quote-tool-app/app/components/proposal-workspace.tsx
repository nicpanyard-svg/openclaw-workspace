"use client";

import Link from "next/link";
import { ProductLogo } from "@/app/components/product-logo";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/app/components/auth-shell";
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

function formatRelativeTime(value: string) {
  const deltaMs = new Date(value).getTime() - Date.now();
  const deltaHours = Math.round(deltaMs / (1000 * 60 * 60));
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(deltaHours) < 24) {
    return formatter.format(deltaHours, "hour");
  }

  return formatter.format(Math.round(deltaHours / 24), "day");
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

function statusAccentClass(status: SavedProposalRecord["status"]) {
  switch (status) {
    case "approved":
      return "proposal-state-accent proposal-state-accent-success";
    case "negotiating":
      return "proposal-state-accent proposal-state-accent-warn";
    case "sent":
    case "open":
      return "proposal-state-accent proposal-state-accent-info";
    case "closed":
      return "proposal-state-accent proposal-state-accent-muted";
    default:
      return "proposal-state-accent";
  }
}

function getNextStepLabel(proposal: SavedProposalRecord) {
  switch (proposal.status) {
    case "draft":
      return "Finish pricing and prep customer review";
    case "sent":
      return "Follow up on customer review";
    case "open":
      return "Tighten scope and confirm feedback";
    case "negotiating":
      return "Work commercial terms and approvals";
    case "approved":
      return "Move into closeout and handoff";
    case "closed":
      return "Reference for renewals or reuse";
    default:
      return "Keep proposal moving";
  }
}

function getPriorityBucket(proposal: SavedProposalRecord) {
  if (proposal.status === "negotiating" || proposal.status === "open") return "next";
  if (proposal.status === "sent" || proposal.status === "draft") return "watch";
  return "done";
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
  const { user } = useAuth();
  const [store, setStore] = useState<ProposalStoreData | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("mine");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const seed = createProposalFromQuote({ quote: sampleQuoteRecord, owner: mockUsers[0], currentUser: mockUsers[0] });
    const fallbackStore = getDefaultProposalStore(seed);

    if (typeof window === "undefined") {
      setStore(fallbackStore);
      setActiveProposalId(fallbackStore.proposals[0]?.id ?? null);
      return;
    }

    const saved = deserializeProposalStore(window.localStorage.getItem(PROPOSAL_STORE_KEY));
    const sessionUser = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.title,
          team: user.team,
        }
      : fallbackStore.currentUser;

    const nextStore = saved
      ? {
          ...saved,
          currentUser: sessionUser,
        }
      : {
          ...fallbackStore,
          currentUser: sessionUser,
        };
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
  }, [user]);

  const proposalSummaries = useMemo(() => {
    if (!store) return [];

    return store.proposals.map((proposal) => ({
      proposal,
      summary: buildProposalSummary(proposal),
      nextStep: getNextStepLabel(proposal),
      priorityBucket: getPriorityBucket(proposal),
    }));
  }, [store]);

  const proposals = useMemo(() => {
    if (!store) return [];

    const normalizedSearch = searchQuery.trim().toLowerCase();

    return proposalSummaries.filter(({ proposal, summary, nextStep }) => {
      const ownerMatch = ownerFilter === "all" ? true : proposal.owner.id === store.currentUser.id;
      const statusMatch = statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? ["draft", "open", "negotiating"].includes(proposal.status)
          : proposal.status === statusFilter;

      const searchMatch = !normalizedSearch
        ? true
        : [
            summary.customerName,
            summary.title,
            summary.proposalNumber,
            summary.ownerName,
            proposal.stageLabel,
            proposal.owner.team ?? "",
            proposal.workspace.accountSegment,
            nextStep,
          ].some((value) => value.toLowerCase().includes(normalizedSearch));

      return ownerMatch && statusMatch && searchMatch;
    });
  }, [ownerFilter, proposalSummaries, searchQuery, statusFilter, store]);

  const groupedProposals = useMemo(() => ({
    next: proposals.filter((entry) => entry.priorityBucket === "next"),
    watch: proposals.filter((entry) => entry.priorityBucket === "watch"),
    done: proposals.filter((entry) => entry.priorityBucket === "done"),
  }), [proposals]);

  const stats = useMemo(() => {
    if (!store) return { total: 0, mine: 0, active: 0, sent: 0 };

    return {
      total: store.proposals.length,
      mine: store.proposals.filter((proposal) => proposal.owner.id === store.currentUser.id).length,
      active: store.proposals.filter((proposal) => ["draft", "open", "negotiating"].includes(proposal.status)).length,
      sent: store.proposals.filter((proposal) => proposal.status === "sent").length,
    };
  }, [store]);

  const launchpadStats = useMemo(() => {
    if (!store) {
      return {
        teamCount: 0,
        activeOwners: 0,
        nextUp: 0,
        approvals: 0,
      };
    }

    return {
      teamCount: store.users.length,
      activeOwners: new Set(
        store.proposals
          .filter((proposal) => ["draft", "open", "negotiating", "sent"].includes(proposal.status))
          .map((proposal) => proposal.owner.id),
      ).size,
      nextUp: store.proposals.filter((proposal) => ["open", "negotiating"].includes(proposal.status)).length,
      approvals: store.proposals.filter((proposal) => proposal.status === "approved").length,
    };
  }, [store]);

  const activeProposal = useMemo(() => {
    if (!store) return null;
    return getProposalById(store, activeProposalId) ?? proposals[0]?.proposal ?? store.proposals[0] ?? null;
  }, [activeProposalId, proposals, store]);

  const currentOwner = store?.currentUser;
  const myOpenCount = store ? store.proposals.filter((proposal) => proposal.owner.id === store.currentUser.id && ["draft", "open", "negotiating"].includes(proposal.status)).length : 0;
  const searchHasResults = proposals.length > 0;
  const activeFilterCount = [ownerFilter !== "mine", statusFilter !== "all", searchQuery.trim().length > 0].filter(Boolean).length;
  const visibleTotalMonthly = proposals.reduce((sum, entry) => sum + entry.summary.totalMonthly, 0);
  const visibleEquipmentTotal = proposals.reduce((sum, entry) => sum + entry.summary.equipmentTotal, 0);

  const setActiveProposal = (proposalId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_PROPOSAL_ID_KEY, proposalId);
    }
    setActiveProposalId(proposalId);
  };

  if (!store || !currentOwner) {
    return <main className="workspace-shell"><div className="workspace-empty">Loading dashboard…</div></main>;
  }

  return (
    <main className="workspace-shell">
      <div className="workspace-container">
        <section className="workspace-hero workspace-dashboard-hero">
          <div className="workspace-dashboard-hero-copy">
            <div className="workspace-brand-block workspace-dashboard-brand-block">
              <ProductLogo width={188} height={54} className="workspace-brand-logo product-logo workspace-queue-logo" priority />
              <div className="workspace-brand-heading-row workspace-dashboard-heading-row">
                <div>
                  <div className="workspace-eyebrow">RapidQuote dashboard</div>
                  <h1 className="workspace-title">Welcome back, {currentOwner.name.split(" ")[0]}.</h1>
                </div>
                <span className="workspace-user-chip">{currentOwner.team} • {currentOwner.role}</span>
              </div>
            </div>
          </div>
          <div className="workspace-actions workspace-dashboard-actions">
            <Link href="/signup" className="workspace-secondary-button">Manage access</Link>
            <Link href="/new" className="workspace-primary-button">+ New Proposal</Link>
          </div>
        </section>

        <section className="workspace-panel workspace-launchpad-panel">
          <div className="workspace-launchpad-grid">
            <div className="workspace-launchpad-card workspace-launchpad-card-primary">
              <div className="workspace-support-label">Your lane</div>
              <strong>{myOpenCount} active proposals</strong>
              <p className="workspace-support-copy">Drafts, open deals, and negotiations assigned to you right now.</p>
            </div>
            <div className="workspace-launchpad-card">
              <div className="workspace-support-label">Team in motion</div>
              <strong>{launchpadStats.activeOwners} teammates active</strong>
              <p className="workspace-support-copy">Across {launchpadStats.teamCount} workspace users, without cluttering the page.</p>
            </div>
            <div className="workspace-launchpad-card">
              <div className="workspace-support-label">What matters next</div>
              <strong>{launchpadStats.nextUp} proposals need push</strong>
              <p className="workspace-support-copy">Open reviews and commercial work that should stay in front of the team.</p>
            </div>
            <div className="workspace-launchpad-card">
              <div className="workspace-support-label">Ready wins</div>
              <strong>{launchpadStats.approvals} approved</strong>
              <p className="workspace-support-copy">Closed-loop visibility on what is ready for handoff or final closeout.</p>
            </div>
          </div>
        </section>

        <section className="workspace-stat-grid">
          <StatFilterCard label="All proposals" value={stats.total} note="Show every saved proposal" active={ownerFilter === "all" && statusFilter === "all"} onClick={() => { setOwnerFilter("all"); setStatusFilter("all"); }} />
          <StatFilterCard label="Assigned to me" value={stats.mine} note="Show only proposals in your lane" active={ownerFilter === "mine" && statusFilter === "all"} onClick={() => { setOwnerFilter("mine"); setStatusFilter("all"); }} />
          <StatFilterCard label="Active work" value={stats.active} note={<>Show drafts, open deals, and<br />negotiations in progress</>} active={ownerFilter === "all" && statusFilter === "active"} onClick={() => { setOwnerFilter("all"); setStatusFilter("active"); }} />
          <StatFilterCard label="Sent out" value={stats.sent} note="Show proposals waiting on review" active={ownerFilter === "all" && statusFilter === "sent"} onClick={() => { setOwnerFilter("all"); setStatusFilter("sent"); }} />
        </section>

        <section className="workspace-panel workspace-dashboard-panel">
          <div className="workspace-panel-topbar workspace-dashboard-topbar">
            <div>
              <div className="workspace-eyebrow">Dashboard</div>
              <h2 className="workspace-section-title">Proposal launchpad</h2>
              <p className="workspace-panel-copy">
                Search by customer, title, owner, next step, or proposal number. Then use the sections below to focus on what needs a push, what should be watched, and what is already done.
              </p>
            </div>
            <div className="workspace-filter-stack">
              <label className="workspace-field workspace-search-field">
                <span>Search</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Customer, title, owner, next step, or proposal #"
                  aria-label="Search proposals by customer, title, owner, next step, or proposal number"
                />
              </label>
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
          </div>

          <div className="workspace-results-summary" aria-live="polite">
            <div className="workspace-results-summary-copy">
              <strong>{proposals.length}</strong> proposal{proposals.length === 1 ? "" : "s"} showing
              {activeFilterCount ? <span> • {activeFilterCount} active filter{activeFilterCount === 1 ? "" : "s"}</span> : <span> • default dashboard view</span>}
            </div>
            <div className="workspace-results-summary-metrics">
              <span><strong>{formatCurrency(visibleTotalMonthly)}</strong> MRR in view</span>
              <span><strong>{formatCurrency(visibleEquipmentTotal)}</strong> one-time in view</span>
            </div>
          </div>

          <div className="workspace-section-stack">
            <DashboardGroup
              title="What needs attention next"
              subtitle="Open reviews and commercial conversations that deserve the front seat."
              emptyLabel="Nothing urgent in this slice right now."
              proposals={groupedProposals.next}
              activeProposalId={activeProposal?.id ?? null}
              setActiveProposal={setActiveProposal}
              tone="next"
            />
            <DashboardGroup
              title="Keep moving"
              subtitle="Drafts and sent proposals that need follow-through, but not full fire-drill energy."
              emptyLabel="No draft or sent proposals match the current filters."
              proposals={groupedProposals.watch}
              activeProposalId={activeProposal?.id ?? null}
              setActiveProposal={setActiveProposal}
              tone="watch"
            />
            <DashboardGroup
              title="Approved or closed"
              subtitle="Useful for quick reference, handoff, and pattern reuse without burying active work."
              emptyLabel="No approved or closed proposals match the current filters."
              proposals={groupedProposals.done}
              activeProposalId={activeProposal?.id ?? null}
              setActiveProposal={setActiveProposal}
              tone="done"
            />
          </div>

          {!searchHasResults ? (
            <div className="workspace-search-empty">
              <strong>No proposals matched that search.</strong>
              <p>Try a customer name, proposal title, owner name, next step phrase, proposal number, or loosen the filters.</p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function DashboardGroup({
  title,
  subtitle,
  emptyLabel,
  proposals,
  activeProposalId,
  setActiveProposal,
  tone,
}: {
  title: string;
  subtitle: string;
  emptyLabel: string;
  proposals: Array<{
    proposal: SavedProposalRecord;
    summary: ReturnType<typeof buildProposalSummary>;
    nextStep: string;
    priorityBucket: string;
  }>;
  activeProposalId: string | null;
  setActiveProposal: (proposalId: string) => void;
  tone: "next" | "watch" | "done";
}) {
  return (
    <section className="workspace-dashboard-group">
      <div className="workspace-dashboard-group-head">
        <div>
          <h3 className="workspace-dashboard-group-title">{title}</h3>
          <p className="workspace-dashboard-group-copy">{subtitle}</p>
        </div>
        <span className={`workspace-dashboard-group-count workspace-dashboard-group-count-${tone}`}>{proposals.length}</span>
      </div>

      {proposals.length ? (
        <div className="workspace-list">
          {proposals.map(({ proposal, summary, nextStep }) => {
            const isActive = proposal.id === activeProposalId;
            const hasOptionalServices = summary.optionalServicesTotal > 0;

            return (
              <article key={proposal.id} className={`proposal-list-card proposal-list-card-visual ${isActive ? "proposal-list-card-active" : ""}`}>
                <div className={statusAccentClass(proposal.status)} aria-hidden="true" />

                <div className="proposal-list-topline">
                  <div className="proposal-list-topline-meta">
                    <div className="proposal-list-kicker">{summary.proposalNumber}</div>
                    <div className="proposal-list-updated">Updated {formatDate(summary.updatedAt)} • {formatRelativeTime(summary.updatedAt)}</div>
                  </div>
                  <div className="proposal-list-status-cluster">
                    <span className={statusTone(proposal.status)}>{proposal.stageLabel || statusToStageLabel(proposal.status)}</span>
                    {isActive ? <span className="proposal-list-selected-pill">Open now</span> : null}
                  </div>
                </div>

                <div className="proposal-list-head proposal-list-head-visual">
                  <div className="proposal-list-title-block">
                    <p className="proposal-list-customer">{summary.customerName}</p>
                    <h3>{summary.title}</h3>
                    <div className="proposal-list-meta-row">
                      <p className="proposal-list-subtitle">Owner {summary.ownerName}</p>
                      <span className="proposal-owner-chip">{proposal.owner.team ?? "Team"}</span>
                      <span className="proposal-segment-chip">{proposal.workspace.accountSegment}</span>
                    </div>
                  </div>
                </div>

                <div className="proposal-next-step-banner">
                  <span>Next step</span>
                  <strong>{nextStep}</strong>
                </div>

                <div className="proposal-commercial-grid">
                  <div className="proposal-commercial-card proposal-commercial-card-primary">
                    <span>Monthly recurring</span>
                    <strong>{formatCurrency(summary.totalMonthly)}</strong>
                    <em>Primary recurring revenue</em>
                  </div>
                  <div className="proposal-commercial-card">
                    <span>One-time total</span>
                    <strong>{formatCurrency(summary.equipmentTotal)}</strong>
                    <em>Equipment and install scope</em>
                  </div>
                  <div className={`proposal-commercial-card ${hasOptionalServices ? "proposal-commercial-card-optional" : "proposal-commercial-card-muted"}`}>
                    <span>Optional services</span>
                    <strong>{formatCurrency(summary.optionalServicesTotal)}</strong>
                    <em>{hasOptionalServices ? "Upsell value included" : "No optional services added"}</em>
                  </div>
                </div>

                <div className="proposal-list-footer proposal-list-footer-visual">
                  <div className="proposal-list-note-block">
                    <div className="proposal-list-note-label">Team context</div>
                    <div className="proposal-list-note">
                      Created {formatDate(proposal.createdAt)} • Last touch {formatDateTime(proposal.updatedAt)}
                    </div>
                    <div className="proposal-list-note proposal-list-note-secondary">
                      Stage {proposal.stageLabel || statusToStageLabel(proposal.status)} • Segment {proposal.workspace.accountSegment}
                    </div>
                  </div>
                  <div className="proposal-list-actions proposal-list-actions-priority">
                    <Link href="/new" className="workspace-primary-button workspace-primary-button-small" onClick={() => setActiveProposal(proposal.id)}>
                      Open Editor
                    </Link>
                    <Link href="/proposal" className="workspace-secondary-button" onClick={() => setActiveProposal(proposal.id)}>
                      Preview Proposal
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="workspace-group-empty">{emptyLabel}</div>
      )}
    </section>
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
            <Link href="/" className="workspace-secondary-button">Dashboard</Link>
            <Link href="/proposal" className="workspace-secondary-button">Preview Proposal</Link>
            <Link href="/new" className="workspace-primary-button">Open Editor</Link>
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

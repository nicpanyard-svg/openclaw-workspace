"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { useAuth } from "@/app/components/auth-shell";
import { roleLabel, type AccessRequestRecord, type AccountStatus, type RapidQuoteRole } from "@/app/lib/auth";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: AccessRequestRecord["status"] | AccountStatus) {
  switch (status) {
    case "approved":
    case "active":
      return "workspace-badge workspace-badge-success";
    case "needs_info":
    case "invited":
    case "pending_admin":
      return "workspace-badge workspace-badge-warn";
    case "denied":
    case "suspended":
      return "workspace-badge workspace-badge-muted";
    default:
      return "workspace-badge workspace-badge-info";
  }
}

const roleOptions: Array<{ value: RapidQuoteRole; label: string }> = [
  { value: "sales", label: "Sales" },
  { value: "sales_ops", label: "Sales Ops" },
  { value: "solutions_engineering", label: "Solutions Engineering" },
  { value: "admin", label: "Admin" },
];

const statusOptions: Array<{ value: AccountStatus; label: string }> = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "pending_admin", label: "Pending admin" },
  { value: "suspended", label: "Suspended" },
];

export default function AccessPage() {
  const {
    user,
    accessRequests,
    directoryUsers,
    accessAudit,
    decideAccessRequest,
    createUser,
    updateUserRole,
    updateUserStatus,
  } = useAuth();
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    title: "",
    team: "Sales",
    role: "sales" as RapidQuoteRole,
    status: "active" as AccountStatus,
    password: "RapidQuote!23",
  });

  const isAdmin = Boolean(user?.canManageUsers);
  const queue = useMemo(() => {
    if (isAdmin) return accessRequests;
    return accessRequests.filter((request) => request.email.toLowerCase() === user?.email.toLowerCase());
  }, [accessRequests, isAdmin, user]);

  const stats = useMemo(() => ({
    pending: queue.filter((request) => request.status === "pending").length,
    needsInfo: queue.filter((request) => request.status === "needs_info").length,
    approved: queue.filter((request) => request.status === "approved").length,
    users: directoryUsers.length,
  }), [directoryUsers.length, queue]);

  const handleDecision = (request: AccessRequestRecord, status: AccessRequestRecord["status"]) => {
    const result = decideAccessRequest(request.id, status, requestNotes[request.id] ?? "");
    setMessage(result.ok ? `${request.email} marked ${status.replace("_", " ")}.` : result.error ?? "Action failed.");
  };

  const handleCreateUser = () => {
    const result = createUser(newUser);
    if (!result.ok) {
      setMessage(result.error ?? "Could not create user.");
      return;
    }

    setMessage(`${newUser.email} added to the directory.`);
    setNewUser({
      name: "",
      email: "",
      title: "",
      team: "Sales",
      role: "sales",
      status: "active",
      password: "RapidQuote!23",
    });
  };

  const handleRoleChange = (userId: string, role: RapidQuoteRole) => {
    const result = updateUserRole(userId, role);
    setMessage(result.ok ? "Role updated." : result.error ?? "Could not update role.");
  };

  const handleStatusChange = (userId: string, status: AccountStatus) => {
    const result = updateUserStatus(userId, status);
    setMessage(result.ok ? "Status updated." : result.error ?? "Could not update status.");
  };

  return (
    <main className="workspace-shell">
      <div className="workspace-container detail-layout">
        <section className="workspace-hero workspace-dashboard-hero">
          <div className="workspace-dashboard-hero-copy">
            <div className="workspace-brand-block workspace-dashboard-brand-block">
              <ProductLogo width={188} height={54} className="workspace-brand-logo product-logo workspace-queue-logo" priority />
              <div className="workspace-brand-heading-row workspace-dashboard-heading-row">
                <div>
                  <div className="workspace-eyebrow">Access Manager</div>
                  <h1 className="workspace-title">{isAdmin ? "Manage users and requests" : "Your access status"}</h1>
                </div>
                <span className="workspace-user-chip">{isAdmin ? "Admin view" : "Requester view"}</span>
              </div>
            </div>
            <p className="workspace-subtitle">
              {isAdmin
                ? "Review RapidQuote access requests, provision users, assign roles, and keep an audit trail of every access change."
                : "Track your RapidQuote access request and review any admin notes tied to your account."}
            </p>
          </div>
          <div className="workspace-actions workspace-dashboard-actions">
            <Link href="/signup" className="workspace-secondary-button">New request</Link>
            <Link href="/" className="workspace-primary-button">Back to dashboard</Link>
          </div>
        </section>

        {message ? <div className="proposal-next-step-banner"><span>Access Manager</span><strong>{message}</strong></div> : null}

        <section className="workspace-launchpad-grid">
          <div className="workspace-launchpad-card workspace-launchpad-card-primary">
            <div className="workspace-support-label">Pending review</div>
            <strong>{stats.pending}</strong>
            <p className="workspace-support-copy">Requests waiting on an admin decision.</p>
          </div>
          <div className="workspace-launchpad-card">
            <div className="workspace-support-label">Need more info</div>
            <strong>{stats.needsInfo}</strong>
            <p className="workspace-support-copy">Requests waiting on manager or requester clarification.</p>
          </div>
          <div className="workspace-launchpad-card">
            <div className="workspace-support-label">Approved</div>
            <strong>{stats.approved}</strong>
            <p className="workspace-support-copy">Requests approved by an admin.</p>
          </div>
          <div className="workspace-launchpad-card">
            <div className="workspace-support-label">Directory users</div>
            <strong>{stats.users}</strong>
            <p className="workspace-support-copy">RapidQuote users saved in the local directory.</p>
          </div>
        </section>

        {isAdmin ? (
          <section className="workspace-panel workspace-focus-panel">
            <div className="workspace-panel-topbar workspace-panel-topbar-stack">
              <div>
                <div className="workspace-eyebrow">User directory</div>
                <h2 className="workspace-section-title">Create a user or admin</h2>
                <p className="workspace-panel-copy">New accounts are saved to the local RapidQuote directory and can sign in when their status is active.</p>
              </div>
            </div>
            <div className="detail-card-grid">
              <label className="detail-card">
                <span>Name</span>
                <input className="auth-input" value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} placeholder="Taylor Brooks" />
              </label>
              <label className="detail-card">
                <span>Email</span>
                <input className="auth-input" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} placeholder="taylor.brooks@inetlte.com" />
              </label>
              <label className="detail-card">
                <span>Title</span>
                <input className="auth-input" value={newUser.title} onChange={(event) => setNewUser({ ...newUser, title: event.target.value })} placeholder="Account Executive" />
              </label>
              <label className="detail-card">
                <span>Team</span>
                <input className="auth-input" value={newUser.team} onChange={(event) => setNewUser({ ...newUser, team: event.target.value })} />
              </label>
              <label className="detail-card">
                <span>Role</span>
                <select className="auth-input" value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value as RapidQuoteRole })}>
                  {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="detail-card">
                <span>Status</span>
                <select className="auth-input" value={newUser.status} onChange={(event) => setNewUser({ ...newUser, status: event.target.value as AccountStatus })}>
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="detail-card">
                <span>Temporary password</span>
                <input className="auth-input" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
              </label>
              <div className="detail-card">
                <span>Action</span>
                <button type="button" className="workspace-primary-button" onClick={handleCreateUser}>Create account</button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="workspace-panel">
          <div className="workspace-panel-topbar workspace-panel-topbar-stack">
            <div>
              <div className="workspace-eyebrow">Current queue</div>
              <h2 className="workspace-section-title">Access requests</h2>
              <p className="workspace-panel-copy">
                {isAdmin ? "Approve, deny, or request more information. Approved requests create an active user if one does not already exist." : "Only requests tied to your email are shown here."}
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

                {isAdmin ? (
                  <div className="workspace-panel-topbar workspace-panel-topbar-stack">
                    <textarea
                      className="auth-input"
                      rows={3}
                      value={requestNotes[request.id] ?? ""}
                      onChange={(event) => setRequestNotes({ ...requestNotes, [request.id]: event.target.value })}
                      placeholder="Add review notes for this decision"
                    />
                    <div className="workspace-actions">
                      <button type="button" className="workspace-primary-button" onClick={() => handleDecision(request, "approved")}>Approve</button>
                      <button type="button" className="workspace-secondary-button" onClick={() => handleDecision(request, "needs_info")}>Needs info</button>
                      <button type="button" className="workspace-secondary-button" onClick={() => handleDecision(request, "denied")}>Deny</button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}

            {!queue.length ? (
              <div className="workspace-group-empty">No access requests to show yet.</div>
            ) : null}
          </div>
        </section>

        {isAdmin ? (
          <section className="workspace-panel">
            <div className="workspace-panel-topbar workspace-panel-topbar-stack">
              <div>
                <div className="workspace-eyebrow">Directory</div>
                <h2 className="workspace-section-title">Users and roles</h2>
                <p className="workspace-panel-copy">Change roles or deactivate users here. RapidQuote blocks changes that would remove the last active admin.</p>
              </div>
            </div>
            <div className="workspace-list">
              {directoryUsers.map((directoryUser) => (
                <article key={directoryUser.id} className="proposal-list-card proposal-list-card-visual">
                  <div className="proposal-list-topline">
                    <div className="proposal-list-topline-meta">
                      <div className="proposal-list-kicker">{directoryUser.initials}</div>
                      <div className="proposal-list-updated">{directoryUser.email}</div>
                    </div>
                    <span className={statusTone(directoryUser.status)}>{directoryUser.status.replace("_", " ")}</span>
                  </div>
                  <div className="proposal-list-head proposal-list-head-visual">
                    <div className="proposal-list-title-block">
                      <p className="proposal-list-customer">{directoryUser.name}</p>
                      <h3>{directoryUser.title}</h3>
                      <div className="proposal-list-meta-row">
                        <span className="proposal-owner-chip">{directoryUser.team}</span>
                        <span className="proposal-segment-chip">{roleLabel(directoryUser.role)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="detail-card-grid">
                    <label className="detail-card">
                      <span>Role</span>
                      <select className="auth-input" value={directoryUser.role} onChange={(event) => handleRoleChange(directoryUser.id, event.target.value as RapidQuoteRole)}>
                        {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label className="detail-card">
                      <span>Status</span>
                      <select className="auth-input" value={directoryUser.status} onChange={(event) => handleStatusChange(directoryUser.id, event.target.value as AccountStatus)}>
                        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {isAdmin ? (
          <section className="workspace-panel">
            <div className="workspace-panel-topbar workspace-panel-topbar-stack">
              <div>
                <div className="workspace-eyebrow">Audit trail</div>
                <h2 className="workspace-section-title">Access history</h2>
                <p className="workspace-panel-copy">Recent access decisions and directory changes are recorded locally for review.</p>
              </div>
            </div>
            <div className="workspace-list">
              {accessAudit.map((entry) => (
                <article key={entry.id} className="proposal-list-card proposal-list-card-visual">
                  <div className="proposal-list-topline">
                    <div className="proposal-list-topline-meta">
                      <div className="proposal-list-kicker">{entry.action.replaceAll("_", " ")}</div>
                      <div className="proposal-list-updated">{formatDateTime(entry.createdAt)}</div>
                    </div>
                    <span className="workspace-badge workspace-badge-info">{entry.actorName}</span>
                  </div>
                  <div className="proposal-next-step-banner">
                    <span>{entry.targetName} • {entry.targetEmail}</span>
                    <strong>{entry.note}</strong>
                  </div>
                </article>
              ))}
              {!accessAudit.length ? <div className="workspace-group-empty">No access history yet.</div> : null}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

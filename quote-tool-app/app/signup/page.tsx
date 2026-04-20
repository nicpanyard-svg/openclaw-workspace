"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { SignupEligibilityMessage, useAuth } from "@/app/components/auth-shell";
import { buildAccessRequestId, canSelfServeSignUp, getDirectoryUsers, type AccessRequestRecord } from "@/app/lib/auth";

export default function SignupPage() {
  const { submitAccessRequest } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [roleNeeded, setRoleNeeded] = useState("");
  const [businessReason, setBusinessReason] = useState("");
  const [submittedRequest, setSubmittedRequest] = useState<AccessRequestRecord | null>(null);
  const directoryUsers = useMemo(() => getDirectoryUsers(), []);
  const eligible = canSelfServeSignUp(email);

  return (
    <main className="auth-shell auth-shell-simple">
      <div className="auth-simple-card">
        <div className="auth-brand-header auth-brand-header-compact">
          <div className="workspace-brand-mark auth-brand-mark auth-simple-brand-mark">
            <ProductLogo width={160} height={45} className="workspace-brand-logo product-logo" priority />
          </div>
          <div className="brand-signature-stack">
            <span className="brand-signature-pill">by iNet</span>
            <div className="brand-trust-note">Internal access workflow</div>
          </div>
        </div>
        <div className="workspace-eyebrow">Access management</div>
        <h1 className="auth-form-title">Request RapidQuote access</h1>
        <p className="auth-form-copy">
          Ask for workspace access the same way the real system will: who you are, what team you are on, what role you need, and why you need it.
          This request now tees up tonight&apos;s backend auth work instead of acting like a demo-only placeholder.
        </p>

        <div className="auth-roadmap-card">
          <div className="auth-roadmap-title">What this page handles right now</div>
          <ul>
            <li>Confirms whether the email is eligible for internal onboarding.</li>
            <li>Captures a believable access request with team and business context.</li>
            <li>Hands off cleanly to approval workflow and directory-backed account creation once the backend finishes landing.</li>
          </ul>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();

            const request: AccessRequestRecord = {
              id: buildAccessRequestId(),
              name: name.trim(),
              email: email.trim(),
              team: team.trim(),
              roleNeeded: roleNeeded.trim(),
              businessReason: businessReason.trim(),
              requestedBy: "Self-serve request",
              status: eligible ? "pending" : "denied",
              createdAt: new Date().toISOString(),
              notes: eligible ? "Waiting on admin review, provisioning, and backend account creation." : "Outside current onboarding rule.",
            };

            submitAccessRequest(request);
            setSubmittedRequest(request);
          }}
        >
          <label className="auth-field">
            <span>Full name</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="First and last name" required autoComplete="name" />
          </label>

          <label className="auth-field">
            <span>Work email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@inetlte.com" required autoComplete="email" />
          </label>

          <label className="auth-field">
            <span>Team</span>
            <input type="text" value={team} onChange={(event) => setTeam(event.target.value)} placeholder="Sales, RevOps, Engineering…" required />
          </label>

          <label className="auth-field">
            <span>Role needed</span>
            <input type="text" value={roleNeeded} onChange={(event) => setRoleNeeded(event.target.value)} placeholder="Account Executive, Sales Ops, Admin…" required />
          </label>

          <label className="auth-field">
            <span>Why do you need access?</span>
            <input type="text" value={businessReason} onChange={(event) => setBusinessReason(event.target.value)} placeholder="Brief reason for quoting, approvals, or proposal work" required />
          </label>

          <SignupEligibilityMessage email={email} />

          <button type="submit" className="workspace-primary-button auth-submit-button">
            Request access
          </button>
        </form>

        <div className="auth-inline-support-row">
          <div className="auth-inline-support-item">
            <span>Who can request</span>
            <strong>iNet teammates</strong>
          </div>
          <div className="auth-inline-support-item">
            <span>What happens next</span>
            <strong>Admin review queue</strong>
          </div>
        </div>

        {submittedRequest ? (
          <div className={`auth-inline-message ${eligible ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
            {eligible
              ? `Access request captured for ${submittedRequest.email}. It is now sitting in the admin review queue with your team and role details attached, ready for backend provisioning.`
              : `RapidQuote by iNet is internal-only today. ${submittedRequest.email} was captured, but it is outside the current onboarding rule.`}
          </div>
        ) : null}

        <div className="auth-directory-card">
          <div className="auth-directory-heading">Current internal account model</div>
          <div className="auth-directory-list">
            {directoryUsers.map((user) => (
              <div key={user.id} className="auth-directory-item">
                <div className="auth-directory-avatar">{user.initials}</div>
                <div>
                  <div className="auth-directory-name">{user.name}</div>
                  <div className="auth-directory-meta">{user.title} • {user.team}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-help-links">
          <Link href="/login">Back to sign in</Link>
          <Link href="/access">View access queue direction</Link>
          <Link href="/forgot-password">Forgot password</Link>
        </div>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { SignupEligibilityMessage } from "@/app/components/auth-shell";
import { canSelfServeSignUp, getDirectoryUsers } from "@/app/lib/auth";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
            <div className="brand-trust-note">Team access</div>
          </div>
        </div>
        <div className="workspace-eyebrow">Access management</div>
        <h1 className="auth-form-title">Request RapidQuote access</h1>
        <p className="auth-form-copy">
          iNet teammates can request RapidQuote access here. Use your work email so the request can be reviewed and routed to the right team.
        </p>

        <div className="auth-roadmap-card">
          <div className="auth-roadmap-title">Before you submit</div>
          <ul>
            <li>Use your @inetlte.com work email.</li>
            <li>Access requests are reviewed before the workspace is opened.</li>
            <li>You can return to sign in once your access is approved.</li>
          </ul>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
          }}
        >
          <label className="auth-field">
            <span>Work email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@inetlte.com" required />
          </label>

          <SignupEligibilityMessage email={email} />

          <button type="submit" className="workspace-primary-button auth-submit-button">
            Request access
          </button>
        </form>

        {submitted ? (
          <div className={`auth-inline-message ${eligible ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
            {eligible
              ? `Access request captured for ${email}. We’ll route it for review and provisioning.`
              : `RapidQuote is currently limited to iNet users. ${email} does not match the current access rule.`}
          </div>
        ) : null}

        <div className="auth-directory-card">
          <div className="auth-directory-heading">Current workspace users</div>
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
          <Link href="/forgot-password">Forgot password</Link>
        </div>
      </div>
    </main>
  );
}

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
            <div className="brand-trust-note">Internal access workflow</div>
          </div>
        </div>
        <div className="workspace-eyebrow">Access management</div>
        <h1 className="auth-form-title">Request RapidQuote access</h1>
        <p className="auth-form-copy">
          Request access for the internal RapidQuote workspace. This keeps the visible product flow believable today while leaving broader approval, SSO, and provisioning work for a later pass.
        </p>

        <div className="auth-roadmap-card">
          <div className="auth-roadmap-title">What this page does today</div>
          <ul>
            <li>Confirms whether the email is eligible for internal onboarding.</li>
            <li>Sets the product expectation that RapidQuote by iNet is an internal iNet tool right now.</li>
            <li>Points to the next enterprise-grade step: approval workflow + directory-backed account creation.</li>
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
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@inetlte.com" required autoComplete="email" />
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

        {submitted ? (
          <div className={`auth-inline-message ${eligible ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
            {eligible
              ? `Access request captured for ${email}. Next step is admin approval and account setup.`
              : `RapidQuote by iNet is internal-only today. ${email} is outside the current onboarding rule.`}
          </div>
        ) : null}

        <div className="auth-directory-card">
          <div className="auth-directory-heading">Current internal user model</div>
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

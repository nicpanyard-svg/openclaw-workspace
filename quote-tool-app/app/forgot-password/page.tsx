"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { useAuth } from "@/app/components/auth-shell";
import { canSelfServeSignUp } from "@/app/lib/auth";
import { RAPIDQUOTE_DEPLOYMENT_BRANDING, getDeploymentAccessScopeLabel, getDeploymentEmailPlaceholder } from "@/app/lib/app-environment";

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const eligible = canSelfServeSignUp(email);

  return (
    <main className="auth-shell auth-shell-simple">
      <div className="auth-simple-card">
        <div className="auth-brand-header auth-brand-header-compact">
          <div className="workspace-brand-mark auth-brand-mark auth-simple-brand-mark">
            <ProductLogo width={160} height={45} className="workspace-brand-logo product-logo" priority />
          </div>
          <div className="brand-signature-stack">
            <span className="brand-signature-pill">{RAPIDQUOTE_DEPLOYMENT_BRANDING.shortName}</span>
            <div className="brand-trust-note">Internal recovery flow</div>
          </div>
        </div>
        <div className="workspace-eyebrow">Password recovery</div>
        <div className="auth-demo-card-pill">Local reset delivery</div>
        <h1 className="auth-form-title">Reset your RapidQuote password</h1>
        <p className="auth-form-copy">
          Start the recovery flow here. In this local access workflow, RapidQuote generates a real in-app reset link immediately
          instead of pretending an email was sent.
        </p>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            const result = requestPasswordReset(email);
            setMessage(result.ok
              ? `Reset link prepared for ${email.trim().toLowerCase()}. Use the button below to finish choosing a new password.`
              : result.error ?? "Could not prepare a reset link.");
            setResetPath(result.ok ? result.resetPath ?? null : null);
            setExpiresAt(result.ok ? result.expiresAt ?? null : null);
          }}
        >
          <label className="auth-field">
            <span>Work email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={getDeploymentEmailPlaceholder()} required autoComplete="username email" />
          </label>

          <button type="submit" className="workspace-primary-button auth-submit-button">Continue</button>
        </form>

        <div className="auth-inline-support-row">
          <div className="auth-inline-support-item">
            <span>Eligible accounts</span>
            <strong>{getDeploymentAccessScopeLabel()}</strong>
          </div>
          <div className="auth-inline-support-item">
            <span>Reset path</span>
            <strong>Immediate in-app link</strong>
          </div>
        </div>

        {message ? (
          <div className={`auth-inline-message ${resetPath ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
            {message}
          </div>
        ) : null}

        {resetPath ? (
          <div className="auth-roadmap-card">
            <div className="auth-roadmap-title">Next step</div>
            <p className="auth-form-copy">
              This reset link stays valid until {expiresAt ? new Date(expiresAt).toLocaleString() : "the token expires"}.
            </p>
            <Link href={resetPath} className="workspace-primary-button auth-submit-button">
              Open reset form
            </Link>
          </div>
        ) : null}

        {!eligible && email ? (
          <div className="auth-inline-message auth-inline-message-warn">
            {`${RAPIDQUOTE_DEPLOYMENT_BRANDING.appLabel} recovery is limited to internal ${RAPIDQUOTE_DEPLOYMENT_BRANDING.shortName} accounts. Use ${getDeploymentAccessScopeLabel()}.`}
          </div>
        ) : null}

        <div className="auth-help-links">
          <Link href="/login">Back to sign in</Link>
          <Link href="/signup">Request access</Link>
        </div>
      </div>
    </main>
  );
}

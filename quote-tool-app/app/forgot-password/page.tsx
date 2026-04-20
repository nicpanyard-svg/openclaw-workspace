"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { canSelfServeSignUp } from "@/app/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
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
            <div className="brand-trust-note">Internal recovery flow</div>
          </div>
        </div>
        <div className="workspace-eyebrow">Password recovery</div>
        <h1 className="auth-form-title">Reset your RapidQuote password</h1>
        <p className="auth-form-copy">
          Start the internal password recovery flow here. This keeps the visible app experience complete without changing the broader authentication implementation in this pass.
        </p>

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

          <button type="submit" className="workspace-primary-button auth-submit-button">Send reset link</button>
        </form>

        <div className="auth-inline-support-row">
          <div className="auth-inline-support-item">
            <span>Eligible accounts</span>
            <strong>@inetlte.com only</strong>
          </div>
          <div className="auth-inline-support-item">
            <span>Reset path</span>
            <strong>Internal guided flow</strong>
          </div>
        </div>

        {submitted ? (
          <div className={`auth-inline-message ${eligible ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
            {eligible
              ? `Reset instructions prepared for ${email}. For this stage, continue to the simulated reset page and wire in real email delivery next.`
              : `RapidQuote by iNet recovery is limited to internal iNet accounts. Use an @inetlte.com address.`}
          </div>
        ) : null}

        <div className="auth-help-links">
          <Link href={`/reset-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}>Continue to reset form</Link>
          <Link href="/login">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}

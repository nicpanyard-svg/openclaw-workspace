"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import { getUserByEmail } from "@/app/lib/auth";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const email = searchParams.get("email") || "";
  const knownUser = email ? getUserByEmail(email) : null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password || password.length < 10) {
      setMessage("Use at least 10 characters to meet the staged minimum while the production password policy is finalized.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords must match.");
      return;
    }

    setMessage(
      knownUser
        ? "Password update accepted on the product surface. The backend still needs to persist the new credential, validate the reset token, and invalidate older sessions."
        : "Password reset surface is ready, but the backend still needs to validate reset tokens, user identity, and password policy before this can go live.",
    );
  };

  return (
    <div className="auth-simple-card">
      <div className="auth-brand-header auth-brand-header-compact">
        <div className="workspace-brand-mark auth-brand-mark auth-simple-brand-mark">
          <ProductLogo width={160} height={45} className="workspace-brand-logo product-logo" priority />
        </div>
        <div className="brand-signature-stack">
          <span className="brand-signature-pill">by iNet</span>
          <div className="brand-trust-note">Internal credential reset</div>
        </div>
      </div>
      <div className="workspace-eyebrow">Reset confirmation</div>
      <div className="auth-demo-card-pill">Staging only — password is not persisted yet</div>
      <h1 className="auth-form-title">Choose a new password</h1>
      <p className="auth-form-copy">
        {email
          ? `Resetting RapidQuote access for ${email}.`
          : "Use this stage page to complete the RapidQuote reset flow once the backend issues a valid reset link."}
      </p>

      <div className="auth-inline-support-row auth-inline-support-row-tight">
        <div className="auth-inline-support-item">
          <span>Password rule</span>
          <strong>10+ characters</strong>
        </div>
        <div className="auth-inline-support-item">
          <span>Account scope</span>
          <strong>{knownUser ? "Known internal account" : "Pending backend validation"}</strong>
        </div>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <input type="email" value={email} readOnly autoComplete="username" tabIndex={-1} aria-hidden="true" className="sr-only" />
        <label className="auth-field">
          <span>New password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" aria-describedby="reset-password-status" />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required autoComplete="new-password" />
        </label>
        <button type="submit" className="workspace-primary-button auth-submit-button">Save new password</button>
      </form>

      {message ? <div id="reset-password-status" className={`auth-inline-message ${message === "Passwords must match." || message.startsWith("Use at least 10 characters") ? "auth-inline-message-warn" : "auth-inline-message-success"}`}>{message}</div> : null}

      <div className="auth-help-links">
        <Link href="/login">Back to sign in</Link>
        <Link href="/forgot-password">Start over</Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="auth-shell auth-shell-simple">
      <Suspense fallback={<div className="auth-simple-card">Loading reset form…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}

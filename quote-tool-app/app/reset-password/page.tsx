"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-shell";
import { ProductLogo } from "@/app/components/product-logo";
import { getPasswordResetRecord, getUserByEmail, isPasswordResetExpired } from "@/app/lib/auth";
import { RAPIDQUOTE_DEPLOYMENT_BRANDING } from "@/app/lib/app-environment";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const { completePasswordReset } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [wasSaved, setWasSaved] = useState(false);
  const token = searchParams.get("token") || "";
  const queryEmail = searchParams.get("email") || "";

  const resetRecord = useMemo(() => getPasswordResetRecord(token), [token]);
  const resolvedEmail = resetRecord?.email ?? queryEmail;
  const knownUser = resolvedEmail ? getUserByEmail(resolvedEmail) : null;
  const linkState = !token
    ? "missing"
    : !resetRecord
      ? "invalid"
      : resetRecord.usedAt
        ? "used"
        : isPasswordResetExpired(resetRecord)
          ? "expired"
          : "valid";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWasSaved(false);

    if (!password || password.length < 10) {
      setMessage("Use at least 10 characters for your new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords must match.");
      return;
    }

    const result = completePasswordReset(token, password);
    if (!result.ok) {
      setMessage(result.error ?? "Could not update your password.");
      return;
    }

    setWasSaved(true);
    setMessage(`Password updated for ${result.email}. You can sign in immediately with your new password.`);
  };

  const linkStateMessage = linkState === "missing"
    ? "Open this page from a reset link so RapidQuote knows which account you are updating."
    : linkState === "invalid"
      ? "That reset link is not recognized anymore. Start a new password reset."
      : linkState === "used"
        ? "That reset link has already been used. Start a new password reset if you need another one."
        : linkState === "expired"
          ? "That reset link expired. Start a new password reset to get a fresh link."
          : null;

  return (
    <div className="auth-simple-card">
      <div className="auth-brand-header auth-brand-header-compact">
        <div className="workspace-brand-mark auth-brand-mark auth-simple-brand-mark">
          <ProductLogo width={160} height={45} className="workspace-brand-logo product-logo" priority />
        </div>
        <div className="brand-signature-stack">
          <span className="brand-signature-pill">{RAPIDQUOTE_DEPLOYMENT_BRANDING.shortName}</span>
          <div className="brand-trust-note">Internal credential reset</div>
        </div>
      </div>
      <div className="workspace-eyebrow">Reset confirmation</div>
      <div className="auth-demo-card-pill">Local password update</div>
      <h1 className="auth-form-title">Choose a new password</h1>
      <p className="auth-form-copy">
        {resolvedEmail
          ? `Resetting RapidQuote access for ${resolvedEmail}.`
          : "Use a valid RapidQuote reset link to choose a new password."}
      </p>

      <div className="auth-inline-support-row auth-inline-support-row-tight">
        <div className="auth-inline-support-item">
          <span>Password rule</span>
          <strong>10+ characters</strong>
        </div>
        <div className="auth-inline-support-item">
          <span>Account scope</span>
          <strong>{knownUser ? "Known internal account" : "Waiting on a valid reset link"}</strong>
        </div>
      </div>

      {linkStateMessage ? <div className="auth-inline-message auth-inline-message-warn">{linkStateMessage}</div> : null}

      <form className="auth-form" onSubmit={handleSubmit}>
        <input type="email" value={resolvedEmail} readOnly autoComplete="username" tabIndex={-1} aria-hidden="true" className="sr-only" />
        <label className="auth-field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
            aria-describedby="reset-password-status"
            disabled={linkState !== "valid" || wasSaved}
          />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
            disabled={linkState !== "valid" || wasSaved}
          />
        </label>
        <button type="submit" className="workspace-primary-button auth-submit-button" disabled={linkState !== "valid" || wasSaved}>
          {wasSaved ? "Password saved" : "Save new password"}
        </button>
      </form>

      {message ? (
        <div id="reset-password-status" className={`auth-inline-message ${wasSaved ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
          {message}
        </div>
      ) : null}

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
      <Suspense fallback={<div className="auth-simple-card">Loading reset form...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}

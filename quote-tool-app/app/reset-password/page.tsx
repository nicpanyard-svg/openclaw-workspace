"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const email = searchParams.get("email") || "";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!password || password.length < 10) {
      setMessage("Use at least 10 characters for a stronger password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords must match.");
      return;
    }

    setMessage("Your new password has been accepted. You can return to sign in.");
  };

  return (
    <div className="auth-simple-card">
      <div className="workspace-eyebrow">Reset confirmation</div>
      <h1 className="auth-form-title">Choose a new password</h1>
      <div className="brand-signature-stack auth-inline-brand-note">
        <span className="brand-signature-pill">by iNet</span>
        <div className="brand-trust-note">Secure password update</div>
      </div>
      <p className="auth-form-copy">{email ? `Resetting access for ${email}.` : "Choose a new password to finish resetting your RapidQuote access."}</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>New password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label className="auth-field">
          <span>Confirm password</span>
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
        </label>
        <button type="submit" className="workspace-primary-button auth-submit-button">Save new password</button>
      </form>

      {message ? <div className="auth-inline-message auth-inline-message-success">{message}</div> : null}

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

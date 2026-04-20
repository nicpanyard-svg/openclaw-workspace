"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthHelpLinks, useAuth } from "@/app/components/auth-shell";
import { ProductLogo } from "@/app/components/product-logo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextRoute = searchParams.get("next") || "/";

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = signIn(email, password);
    if (!result.ok) {
      setError(result.error ?? "Unable to sign in.");
      setIsSubmitting(false);
      return;
    }

    router.replace(nextRoute);
  };

  return (
    <section className="auth-form-panel">
      <div className="auth-form-header">
        <div className="auth-brand-header auth-brand-header-compact">
          <div className="flex items-center gap-3">
            <Image src="/inet-logo.png" alt="iNet logo" width={44} height={44} className="h-11 w-11 object-contain" priority />
            <ProductLogo width={150} height={42} className="h-10 w-auto object-contain" priority />
          </div>
        </div>
        <h2 className="auth-form-title">Sign in to RapidQuote</h2>
        <p className="auth-form-copy">Sign in to access RapidQuote and continue working on quotes, proposals, and customer-ready documents.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Work email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@inetlte.com" required autoComplete="email" />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" required autoComplete="current-password" />
        </label>

        {error ? <div className="auth-inline-message auth-inline-message-warn">{error}</div> : null}

        <button type="submit" className="workspace-primary-button auth-submit-button" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <AuthHelpLinks />

      <div className="auth-footer-note">
        Need access? <Link href="/signup">Request an account</Link>. Need to reset your password? <Link href="/forgot-password">Reset it here</Link>.
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-shell auth-shell-simple">
      <Suspense fallback={<section className="auth-form-panel auth-form-panel-single">Loading sign-in…</section>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ProductLogo } from "@/app/components/product-logo";
import {
  AUTH_STORAGE_KEY,
  authenticateWithPassword,
  canSelfServeSignUp,
  deserializeAuthSession,
  isSessionExpired,
  type AuthSession,
  type AuthUser,
} from "@/app/lib/auth";

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isReady: boolean;
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const protectedRoutes = ["/", "/new", "/proposal", "/proposals"];
const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isReady, setIsReady] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedSession = deserializeAuthSession(window.localStorage.getItem(AUTH_STORAGE_KEY));
    if (savedSession && !isSessionExpired(savedSession)) {
      setSession(savedSession);
    } else if (savedSession) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const routeRequiresAuth = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
    const routeIsAuthPage = authRoutes.includes(pathname);

    if (routeRequiresAuth && !session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (routeIsAuthPage && session && pathname !== "/reset-password") {
      router.replace("/");
    }
  }, [isReady, pathname, router, session]);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isReady,
    signIn(email: string, password: string) {
      const result = authenticateWithPassword(email, password);
      if (!result.ok || !result.session) {
        return { ok: false, error: result.error };
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.session));
      }

      setSession(result.session);
      return { ok: true };
    },
    signOut() {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
      setSession(null);
      router.replace("/login");
    },
  }), [isReady, router, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { isReady, session } = useAuth();

  if (!isReady) {
    return <div className="auth-loading-shell"><div className="auth-loading-card">Opening RapidQuote…</div></div>;
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, isReady } = useAuth();
  const isChromeFreeRoute = pathname.startsWith("/proposal/print");
  const showChrome = isReady && user && !authRoutes.includes(pathname) && !isChromeFreeRoute;

  if (!showChrome) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell-frame">
      <header className="app-shell-header">
        <div className="app-shell-brand-lockup">
          <div className="app-shell-brand-family">
            <ProductLogo width={164} height={46} className="workspace-brand-logo product-logo app-shell-product-logo" priority />
            <div className="app-shell-brand-copy">
              <div className="app-shell-eyebrow">Proposal workspace</div>
              <div className="app-shell-title">RapidQuote</div>
            </div>
          </div>
        </div>
        <div className="app-shell-userbar">
          <div className="app-shell-usercard">
            <div className="app-shell-avatar">{user.initials}</div>
            <div>
              <div className="app-shell-user-name">{user.name}</div>
              <div className="app-shell-user-meta">{user.title} • {user.team}</div>
            </div>
          </div>
          <nav className="app-shell-nav" aria-label="Workspace navigation">
            <Link href="/">Dashboard</Link>
            <Link href="/new">Editor</Link>
            <Link href="/proposal">Preview</Link>
          </nav>
          <button type="button" className="workspace-secondary-button" onClick={signOut}>Log out</button>
        </div>
      </header>
      <div className="app-shell-content">{children}</div>
    </div>
  );
}

export function AuthMarketingPanel() {
  return (
    <section className="auth-marketing-panel">
      <div className="auth-brand-header">
        <div className="workspace-brand-mark auth-marketing-brand-mark">
          <ProductLogo width={168} height={48} className="workspace-brand-logo product-logo" priority />
        </div>
        <div className="brand-signature-stack">
          <span className="brand-signature-pill">by iNet</span>
          <div className="brand-trust-note">Built for iNet proposal teams</div>
        </div>
      </div>
      <h1 className="auth-marketing-title">One place to build, review, and manage proposals.</h1>
      <p className="auth-marketing-copy">
        RapidQuote keeps pricing, proposal work, and deal progress in one clear workspace so your team can move faster with less friction.
      </p>

      <div className="auth-marketing-grid">
        <div className="auth-marketing-card">
          <span>Secure access</span>
          <strong>Protected team workspace</strong>
          <p>Keep quotes, proposal details, and account activity in one place for approved team members.</p>
        </div>
        <div className="auth-marketing-card">
          <span>Move faster</span>
          <strong>Built for daily proposal work</strong>
          <p>Create, review, and refine proposals without bouncing between disconnected tools.</p>
        </div>
        <div className="auth-marketing-card">
          <span>Shared visibility</span>
          <strong>Clear team view</strong>
          <p>Give sales, operations, and technical teams a consistent view of active work and proposal progress.</p>
        </div>
      </div>
    </section>
  );
}

export function AuthHelpLinks() {
  return (
    <div className="auth-help-links">
      <Link href="/forgot-password">Forgot password</Link>
      <Link href="/signup">Request access</Link>
    </div>
  );
}

export function SignupEligibilityMessage({ email }: { email: string }) {
  if (!email) return null;

  const selfServe = canSelfServeSignUp(email);

  return (
    <div className={`auth-inline-message ${selfServe ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
      {selfServe
        ? "Looks like an iNet teammate. You can request access and we’ll route it for approval."
        : "RapidQuote is currently limited to iNet users. Use an @inetlte.com address or contact your workspace admin for access."}
    </div>
  );
}

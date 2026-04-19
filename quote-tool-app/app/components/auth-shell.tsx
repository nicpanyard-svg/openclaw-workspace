"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AUTH_STORAGE_KEY,
  authenticateWithPassword,
  canSelfServeSignUp,
  demoCredentials,
  deserializeAuthSession,
  getDirectoryUsers,
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
    return <div className="auth-loading-shell"><div className="auth-loading-card">Loading RapidQuote…</div></div>;
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, isReady } = useAuth();
  const showChrome = isReady && user && !authRoutes.includes(pathname);

  if (!showChrome) {
    return <>{children}</>;
  }

  return (
    <div>
      <header className="app-shell-header">
        <div>
          <div className="app-shell-eyebrow">RapidQuote Workspace</div>
          <div className="app-shell-title">Enterprise quote builder</div>
        </div>
        <div className="app-shell-userbar">
          <div className="app-shell-usercard">
            <div className="app-shell-avatar">{user.initials}</div>
            <div>
              <div className="app-shell-user-name">{user.name}</div>
              <div className="app-shell-user-meta">{user.title} • {user.team}</div>
            </div>
          </div>
          <nav className="app-shell-nav">
            <Link href="/">Queue</Link>
            <Link href="/new">Builder</Link>
            <Link href="/proposal">Preview</Link>
            <Link href="/signup">Users</Link>
          </nav>
          <button type="button" className="workspace-secondary-button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      {children}
    </div>
  );
}

export function AuthMarketingPanel() {
  const directoryUsers = getDirectoryUsers();

  return (
    <section className="auth-marketing-panel">
      <div className="auth-marketing-kicker">RapidQuote</div>
      <h1 className="auth-marketing-title">Proposal access built for a real multi-user sales team.</h1>
      <p className="auth-marketing-copy">
        This pass gives RapidQuote a proper front door: named users, session gating, sign-in, self-serve direction for
        <strong> @inetlte.com</strong> teammates, and a clearer path toward enterprise-grade permissions.
      </p>

      <div className="auth-marketing-grid">
        <div className="auth-marketing-card">
          <span>What’s live now</span>
          <strong>Session-gated builder</strong>
          <p>Queue, builder, preview, and proposal detail routes now sit behind authenticated access instead of opening straight to the editor.</p>
        </div>
        <div className="auth-marketing-card">
          <span>User direction</span>
          <strong>iNet self-serve onboarding</strong>
          <p>Teammates with an @inetlte.com email are clearly routed into a request-access flow instead of fake public signup scaffolding.</p>
        </div>
        <div className="auth-marketing-card">
          <span>Enterprise path</span>
          <strong>Roles and account states</strong>
          <p>Users now carry role, team, status, and admin capability metadata so the builder can grow into approvals and shared ownership next.</p>
        </div>
      </div>

      <div className="auth-directory-card">
        <div className="auth-directory-heading">Seeded internal users for this stage</div>
        <div className="auth-directory-list">
          {directoryUsers.map((user) => (
            <div key={user.id} className="auth-directory-item">
              <div className="auth-directory-avatar">{user.initials}</div>
              <div>
                <div className="auth-directory-name">{user.name}</div>
                <div className="auth-directory-meta">{user.title} • {user.email}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="auth-demo-hint">
        Demo sign-in for build validation: <strong>{demoCredentials.email}</strong> / <strong>{demoCredentials.password}</strong>
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
        ? "Looks like an iNet teammate. You can request RapidQuote access and get routed into the internal approval queue."
        : "RapidQuote is currently limited to internal iNet users. Use an @inetlte.com address or contact the product owner for access."}
    </div>
  );
}

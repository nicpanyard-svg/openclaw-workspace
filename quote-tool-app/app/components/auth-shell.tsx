"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACCESS_REQUESTS_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  authenticateWithPassword,
  canSelfServeSignUp,
  deserializeAccessRequests,
  deserializeAuthSession,
  getSeededAccessRequests,
  isSessionExpired,
  type AccessRequestRecord,
  type AuthSession,
  type AuthUser,
} from "@/app/lib/auth";

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isReady: boolean;
  accessRequests: AccessRequestRecord[];
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signOut: () => void;
  submitAccessRequest: (request: AccessRequestRecord) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const protectedRoutes = ["/", "/new", "/proposal", "/proposals", "/workspace", "/access"];
const authRoutes = ["/login", "/signup", "/forgot-password", "/reset-password"];

function sanitizeNextRoute(next: string | null, pathname: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  const [nextPath] = next.split("?");
  if (!nextPath || authRoutes.includes(nextPath) || nextPath === pathname) {
    return "/";
  }

  return next;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRecord[]>(getSeededAccessRequests);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setIsHydrated(true);

    const savedSession = deserializeAuthSession(window.localStorage.getItem(AUTH_STORAGE_KEY));
    if (savedSession && !isSessionExpired(savedSession)) {
      setSession(savedSession);
    } else if (savedSession) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    const savedAccessRequests = deserializeAccessRequests(window.localStorage.getItem(ACCESS_REQUESTS_STORAGE_KEY));
    window.localStorage.setItem(ACCESS_REQUESTS_STORAGE_KEY, JSON.stringify(savedAccessRequests));
    setAccessRequests(savedAccessRequests);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY) {
        const nextSession = deserializeAuthSession(event.newValue);
        setSession(nextSession && !isSessionExpired(nextSession) ? nextSession : null);
        return;
      }

      if (event.key === ACCESS_REQUESTS_STORAGE_KEY) {
        setAccessRequests(deserializeAccessRequests(event.newValue));
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [isHydrated]);

  const isReady = isHydrated;

  useEffect(() => {
    if (!isReady) return;

    const routeIsServerPdfPrint = pathname === "/proposal/print" && typeof window !== "undefined" && Boolean(new URLSearchParams(window.location.search).get("token"));
    const routeRequiresAuth = !routeIsServerPdfPrint && protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
    const routeIsAuthPage = authRoutes.includes(pathname);

    if (routeRequiresAuth && !session) {
      const loginRoute = `/login?next=${encodeURIComponent(sanitizeNextRoute(pathname, pathname))}`;
      router.replace(loginRoute);

      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.replace(loginRoute);
      }
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
    accessRequests,
    signIn(email: string, password: string) {
      const result = authenticateWithPassword(email, password);
      if (!result.ok || !result.session) {
        return { ok: false, error: result.error };
      }

      setSession(result.session);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.session));
      }

      return { ok: true };
    },
    signOut() {
      setSession(null);

      if (typeof window !== "undefined") {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.location.replace("/login");
        return;
      }

      router.replace("/login");
      router.refresh();
    },
    submitAccessRequest(request: AccessRequestRecord) {
      const nextRequests = [request, ...accessRequests];
      setAccessRequests(nextRequests);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACCESS_REQUESTS_STORAGE_KEY, JSON.stringify(nextRequests));
        router.refresh();
      }
    },
  }), [accessRequests, isReady, router, session]);

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
  const { user, signOut, isReady, accessRequests } = useAuth();
  const isChromeFreeRoute = pathname.startsWith("/proposal/print");
  const showChrome = isReady && user && !authRoutes.includes(pathname) && !isChromeFreeRoute;
  const pendingAccessCount = accessRequests.filter((request) => request.status === "pending").length;

  if (!showChrome) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell-frame">
      <header className="app-shell-header">
        <div className="app-shell-brand-lockup">
          <div className="app-shell-brand-family">
            <Image
              src="/inet-logo.png"
              alt="iNet logo"
              width={112}
              height={32}
              className="app-shell-parent-brand-logo h-auto w-auto"
              priority
            />
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
            <Link href="/">Start</Link>
            <Link href="/workspace">Workspace</Link>
            <Link href="/new?mode=new">Builder</Link>
            <Link href="/proposal">Preview</Link>
            <Link href="/access">Access {user.canManageUsers ? `(${pendingAccessCount})` : ""}</Link>
          </nav>
          <button type="button" className="workspace-secondary-button" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <div className="app-shell-content">{children}</div>
    </div>
  );
}

export function AuthMarketingPanel() {
  return (
    <section className="auth-marketing-panel" aria-hidden="true">
      <div className="auth-marketing-kicker">Secure proposal workspace</div>
      <h1 className="auth-marketing-title">RapidQuote by iNet gives every teammate a clean front door into quoting, approvals, and proposal delivery.</h1>
      <p className="auth-marketing-copy">
        Tonight&apos;s auth work is landing behind this surface. These screens now frame RapidQuote as a real internal workspace with clear sign-in,
        request-access, and recovery paths instead of a product demo shortcut.
      </p>

      <div className="auth-marketing-grid">
        <article className="auth-marketing-card">
          <span>Access rules</span>
          <strong>Internal first</strong>
          <p>iNet users can request access directly, while external parties stay on exported proposal outputs for now.</p>
        </article>
        <article className="auth-marketing-card">
          <span>Shared ownership</span>
          <strong>Admin queue direction</strong>
          <p>Requests, approvals, and role decisions have a visible place to land instead of living in someone&apos;s head.</p>
        </article>
        <article className="auth-marketing-card">
          <span>User trust</span>
          <strong>Clear next steps</strong>
          <p>Every auth screen explains what is live now and what the backend will take over next.</p>
        </article>
      </div>

      <div className="auth-roadmap-card">
        <div className="auth-roadmap-title">Backend connection points landing next</div>
        <ul>
          <li>Directory-backed users, real invites, and passwordless or SSO flows.</li>
          <li>Approval logic, audit history, and role-based provisioning.</li>
          <li>Email delivery, reset tokens, and production-grade policy enforcement.</li>
        </ul>
      </div>
    </section>
  );
}

export function AuthHelpLinks() {
  return (
    <div className="auth-help-links" role="navigation" aria-label="Authentication help links">
      <Link href="/forgot-password">Forgot password</Link>
      <Link href="/signup">Request access</Link>
    </div>
  );
}

export function AuthSignInStatusCard() {
  return (
    <div className="auth-demo-card" aria-label="Sign in status">
      <div className="auth-demo-card-header">
        <div>
          <div className="auth-demo-card-label">Sign-in status</div>
          <strong>Internal account access is required</strong>
        </div>
        <span className="auth-demo-card-pill">Staging</span>
      </div>
      <div className="auth-demo-credentials-grid">
        <div className="auth-demo-credential-item">
          <span>Who can sign in</span>
          <code>Approved iNet users</code>
        </div>
        <div className="auth-demo-credential-item">
          <span>Backend handoff</span>
          <code>Real auth wiring in progress</code>
        </div>
      </div>
      <p className="auth-demo-hint">If your account is not ready yet, use Request access or Forgot password so the new backend flow has a clean user-facing path to attach to.</p>
    </div>
  );
}

export function SignupEligibilityMessage({ email }: { email: string }) {
  if (!email) return null;

  const selfServe = canSelfServeSignUp(email);

  return (
    <div className={`auth-inline-message ${selfServe ? "auth-inline-message-success" : "auth-inline-message-warn"}`}>
      {selfServe
        ? "Looks like an iNet teammate. You can request RapidQuote by iNet access and get routed into the internal approval queue."
        : "RapidQuote by iNet is currently limited to internal iNet users. Use an @inetlte.com address or contact the product owner for access."}
    </div>
  );
}

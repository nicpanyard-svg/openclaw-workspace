"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ACCESS_AUDIT_STORAGE_KEY,
  ACCESS_REQUESTS_STORAGE_KEY,
  AUTH_STORAGE_KEY,
  USER_DIRECTORY_STORAGE_KEY,
  activeAdminCount,
  authenticateWithPassword,
  buildAccessAuditId,
  buildInitials,
  buildSession,
  buildUserId,
  canSelfServeSignUp,
  deserializeAccessAudit,
  deserializeAccessRequests,
  deserializeAuthSession,
  deserializeDirectoryUsers,
  getSeededAccessRequests,
  inferRoleFromRequest,
  isSessionExpired,
  normalizeDirectoryUser,
  roleLabel,
  type AccessAuditAction,
  type AccessAuditRecord,
  type AccessRequestRecord,
  type AccessRequestStatus,
  type AccountStatus,
  type AuthSession,
  type AuthUser,
  type DirectoryUserRecord,
  type RapidQuoteRole,
} from "@/app/lib/auth";

type CreateUserInput = {
  name: string;
  email: string;
  title: string;
  team: string;
  role: RapidQuoteRole;
  status: AccountStatus;
  password: string;
};

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  isReady: boolean;
  accessRequests: AccessRequestRecord[];
  directoryUsers: AuthUser[];
  accessAudit: AccessAuditRecord[];
  signIn: (email: string, password: string) => { ok: boolean; error?: string };
  signOut: () => void;
  submitAccessRequest: (request: AccessRequestRecord) => void;
  decideAccessRequest: (requestId: string, status: AccessRequestStatus, notes: string) => { ok: boolean; error?: string };
  createUser: (input: CreateUserInput) => { ok: boolean; error?: string };
  updateUserRole: (userId: string, role: RapidQuoteRole) => { ok: boolean; error?: string };
  updateUserStatus: (userId: string, status: AccountStatus) => { ok: boolean; error?: string };
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

function toSafeUsers(users: DirectoryUserRecord[]): AuthUser[] {
  return users.map(({ password, ...user }) => {
    void password;
    return user;
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequestRecord[]>(getSeededAccessRequests);
  const [directoryRecords, setDirectoryRecords] = useState<DirectoryUserRecord[]>(() => deserializeDirectoryUsers(null));
  const [accessAudit, setAccessAudit] = useState<AccessAuditRecord[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setIsHydrated(true);

    const savedUsers = deserializeDirectoryUsers(window.localStorage.getItem(USER_DIRECTORY_STORAGE_KEY));
    window.localStorage.setItem(USER_DIRECTORY_STORAGE_KEY, JSON.stringify(savedUsers));
    setDirectoryRecords(savedUsers);

    const savedSession = deserializeAuthSession(window.localStorage.getItem(AUTH_STORAGE_KEY));
    if (savedSession && !isSessionExpired(savedSession)) {
      setSession(savedSession);
    } else if (savedSession) {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    const savedAccessRequests = deserializeAccessRequests(window.localStorage.getItem(ACCESS_REQUESTS_STORAGE_KEY));
    window.localStorage.setItem(ACCESS_REQUESTS_STORAGE_KEY, JSON.stringify(savedAccessRequests));
    setAccessRequests(savedAccessRequests);

    const savedAudit = deserializeAccessAudit(window.localStorage.getItem(ACCESS_AUDIT_STORAGE_KEY));
    window.localStorage.setItem(ACCESS_AUDIT_STORAGE_KEY, JSON.stringify(savedAudit));
    setAccessAudit(savedAudit);
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
        return;
      }

      if (event.key === USER_DIRECTORY_STORAGE_KEY) {
        setDirectoryRecords(deserializeDirectoryUsers(event.newValue));
        return;
      }

      if (event.key === ACCESS_AUDIT_STORAGE_KEY) {
        setAccessAudit(deserializeAccessAudit(event.newValue));
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

  const persistDirectory = (nextUsers: DirectoryUserRecord[]) => {
    const normalized = nextUsers.map(normalizeDirectoryUser);
    setDirectoryRecords(normalized);
    window.localStorage.setItem(USER_DIRECTORY_STORAGE_KEY, JSON.stringify(normalized));

    if (session) {
      const refreshedUser = normalized.find((record) => record.email === session.user.email);
      if (!refreshedUser || refreshedUser.status !== "active") {
        setSession(null);
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      } else {
        const nextSession = buildSession(toSafeUsers([refreshedUser])[0]);
        setSession(nextSession);
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      }
    }
  };

  const addAudit = (action: AccessAuditAction, target: { name: string; email: string }, note: string) => {
    const actor = session?.user;
    const record: AccessAuditRecord = {
      id: buildAccessAuditId(),
      action,
      actorName: actor?.name ?? "RapidQuote Admin",
      actorEmail: actor?.email ?? "admin@inetlte.com",
      targetName: target.name,
      targetEmail: target.email,
      createdAt: new Date().toISOString(),
      note,
    };
    const nextAudit = [record, ...accessAudit].slice(0, 100);
    setAccessAudit(nextAudit);
    window.localStorage.setItem(ACCESS_AUDIT_STORAGE_KEY, JSON.stringify(nextAudit));
  };

  const requireAdmin = () => {
    if (!session?.user.canManageUsers) {
      return "Admin access is required for that action.";
    }
    return null;
  };

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isReady,
    accessRequests,
    directoryUsers: toSafeUsers(directoryRecords),
    accessAudit,
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
    decideAccessRequest(requestId: string, status: AccessRequestStatus, notes: string) {
      const adminError = requireAdmin();
      if (adminError) return { ok: false, error: adminError };

      const request = accessRequests.find((item) => item.id === requestId);
      if (!request) return { ok: false, error: "Access request was not found." };

      const reviewNotes = notes.trim() || request.notes || "Reviewed by admin.";
      const reviewedRequest: AccessRequestRecord = {
        ...request,
        status,
        notes: reviewNotes,
        reviewedAt: new Date().toISOString(),
        reviewerName: session?.user.name,
      };
      const nextRequests = accessRequests.map((item) => item.id === requestId ? reviewedRequest : item);
      setAccessRequests(nextRequests);
      window.localStorage.setItem(ACCESS_REQUESTS_STORAGE_KEY, JSON.stringify(nextRequests));

      if (status === "approved") {
        const existing = directoryRecords.find((record) => record.email === request.email.toLowerCase());
        if (!existing) {
          const role = inferRoleFromRequest(request.roleNeeded);
          const nextUser = normalizeDirectoryUser({
            id: buildUserId(request.name, request.email),
            name: request.name,
            email: request.email,
            title: request.roleNeeded,
            team: request.team,
            role,
            status: "active",
            initials: buildInitials(request.name),
            canManageUsers: role === "admin",
            password: "RapidQuote!23",
          });
          persistDirectory([nextUser, ...directoryRecords]);
        }
      }

      const action: AccessAuditAction = status === "approved" ? "request_approved" : status === "denied" ? "request_denied" : "request_needs_info";
      addAudit(action, request, `${request.email} marked ${status.replace("_", " ")}. ${reviewNotes}`);
      return { ok: true };
    },
    createUser(input: CreateUserInput) {
      const adminError = requireAdmin();
      if (adminError) return { ok: false, error: adminError };

      const email = input.email.trim().toLowerCase();
      if (!input.name.trim() || !email) return { ok: false, error: "Name and email are required." };
      if (directoryRecords.some((record) => record.email === email)) return { ok: false, error: "That email already exists in the directory." };

      const nextUser = normalizeDirectoryUser({
        id: buildUserId(input.name, email),
        name: input.name.trim(),
        email,
        title: input.title.trim() || roleLabel(input.role),
        team: input.team.trim() || "Sales",
        role: input.role,
        status: input.status,
        initials: buildInitials(input.name),
        canManageUsers: input.role === "admin",
        password: input.password.trim() || "RapidQuote!23",
      });

      persistDirectory([nextUser, ...directoryRecords]);
      addAudit("user_created", nextUser, `${nextUser.name} added as ${roleLabel(nextUser.role)} with ${nextUser.status} status.`);
      return { ok: true };
    },
    updateUserRole(userId: string, role: RapidQuoteRole) {
      const adminError = requireAdmin();
      if (adminError) return { ok: false, error: adminError };

      const target = directoryRecords.find((record) => record.id === userId);
      if (!target) return { ok: false, error: "User was not found." };

      const wouldRemoveLastAdmin = target.role === "admin" && role !== "admin" && target.status === "active" && activeAdminCount(directoryRecords) <= 1;
      if (wouldRemoveLastAdmin) return { ok: false, error: "RapidQuote must keep at least one active admin." };

      const nextUsers = directoryRecords.map((record) => record.id === userId ? normalizeDirectoryUser({ ...record, role }) : record);
      persistDirectory(nextUsers);
      addAudit("role_changed", target, `${target.name} role changed from ${roleLabel(target.role)} to ${roleLabel(role)}.`);
      return { ok: true };
    },
    updateUserStatus(userId: string, status: AccountStatus) {
      const adminError = requireAdmin();
      if (adminError) return { ok: false, error: adminError };

      const target = directoryRecords.find((record) => record.id === userId);
      if (!target) return { ok: false, error: "User was not found." };

      const wouldRemoveLastAdmin = target.role === "admin" && target.status === "active" && status !== "active" && activeAdminCount(directoryRecords) <= 1;
      if (wouldRemoveLastAdmin) return { ok: false, error: "RapidQuote must keep at least one active admin." };

      const nextUsers = directoryRecords.map((record) => record.id === userId ? normalizeDirectoryUser({ ...record, status }) : record);
      persistDirectory(nextUsers);
      addAudit("status_changed", target, `${target.name} status changed from ${target.status} to ${status}.`);
      return { ok: true };
    },
  }), [accessAudit, accessRequests, directoryRecords, isReady, router, session]);

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
        RapidQuote keeps account access behind an internal review path, so quoting data stays with approved iNet teammates.
      </p>

      <div className="auth-marketing-grid">
        <article className="auth-marketing-card">
          <span>Access rules</span>
          <strong>Internal first</strong>
          <p>iNet users can request access directly, while external parties stay on exported proposal outputs.</p>
        </article>
        <article className="auth-marketing-card">
          <span>Shared ownership</span>
          <strong>Admin queue</strong>
          <p>Requests, approvals, and role decisions have one visible place to land.</p>
        </article>
        <article className="auth-marketing-card">
          <span>User trust</span>
          <strong>Clear next steps</strong>
          <p>Every auth screen explains where the request stands and what happens next.</p>
        </article>
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
        <span className="auth-demo-card-pill">Controlled access</span>
      </div>
      <div className="auth-demo-credentials-grid">
        <div className="auth-demo-credential-item">
          <span>Who can sign in</span>
          <code>Approved iNet users</code>
        </div>
        <div className="auth-demo-credential-item">
          <span>Where access is managed</span>
          <code>Access Manager</code>
        </div>
      </div>
      <p className="auth-demo-hint">If your account is not ready yet, use Request access or Forgot password so an admin can review the request.</p>
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

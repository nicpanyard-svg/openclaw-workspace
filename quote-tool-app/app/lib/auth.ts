export const AUTH_STORAGE_KEY = "rapidquote:auth-session";
export const ACCESS_REQUESTS_STORAGE_KEY = "rapidquote:access-requests";

export type RapidQuoteRole = "sales" | "sales_ops" | "solutions_engineering" | "admin";
export type AccountStatus = "active" | "invited" | "pending_admin" | "suspended";
export type AccessRequestStatus = "pending" | "approved" | "needs_info" | "denied";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  team: string;
  role: RapidQuoteRole;
  status: AccountStatus;
  initials: string;
  canManageUsers: boolean;
};

export type AuthSession = {
  user: AuthUser;
  issuedAt: string;
  expiresAt: string;
};

export type SignInResult = {
  ok: boolean;
  session?: AuthSession;
  error?: string;
};

export type AccessRequestRecord = {
  id: string;
  name: string;
  email: string;
  team: string;
  roleNeeded: string;
  businessReason: string;
  requestedBy: string;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewerName?: string;
  notes?: string;
};

const EIGHT_HOURS_MS = 1000 * 60 * 60 * 8;

const users: Array<AuthUser & { password: string }> = [
  {
    id: "nick-panyard",
    name: "Nick Panyard",
    email: "nick.panyard@inetlte.com",
    title: "Account Executive",
    team: "Sales",
    role: "sales",
    status: "active",
    initials: "NP",
    canManageUsers: false,
    password: "RapidQuote!23",
  },
  {
    id: "casey-morgan",
    name: "Casey Morgan",
    email: "casey@inetlte.com",
    title: "Sales Ops Lead",
    team: "Revenue Operations",
    role: "sales_ops",
    status: "active",
    initials: "CM",
    canManageUsers: true,
    password: "RapidQuote!23",
  },
  {
    id: "sam-rivera",
    name: "Sam Rivera",
    email: "sam@inetlte.com",
    title: "Solutions Engineer",
    team: "Engineering",
    role: "solutions_engineering",
    status: "active",
    initials: "SR",
    canManageUsers: false,
    password: "RapidQuote!23",
  },
  {
    id: "john-mcmahon",
    name: "John McMahon",
    email: "john.mcmahon@inetlte.com",
    title: "Account Executive",
    team: "Sales",
    role: "sales",
    status: "active",
    initials: "JM",
    canManageUsers: false,
    password: "RapidQuote!26",
  },
];

const seededAccessRequests: AccessRequestRecord[] = [
  {
    id: "rq-access-1001",
    name: "Taylor Brooks",
    email: "taylor.brooks@inetlte.com",
    team: "Sales",
    roleNeeded: "Account Executive",
    businessReason: "Needs access to build and review customer quote packages for new midstream opportunities.",
    requestedBy: "Manager invite",
    status: "pending",
    createdAt: "2026-04-18T14:15:00.000Z",
    notes: "New hire starting Monday. Prioritize before territory handoff.",
  },
  {
    id: "rq-access-1002",
    name: "Jordan Lee",
    email: "jordan.lee@inetlte.com",
    team: "Revenue Operations",
    roleNeeded: "Sales Ops Analyst",
    businessReason: "Needs visibility into proposal output and approval workflow for process QA.",
    requestedBy: "Self-serve request",
    status: "needs_info",
    createdAt: "2026-04-17T09:40:00.000Z",
    reviewedAt: "2026-04-17T15:10:00.000Z",
    reviewerName: "Casey Morgan",
    notes: "Waiting on manager confirmation for admin scope.",
  },
  {
    id: "rq-access-1003",
    name: "Morgan Patel",
    email: "morgan.patel@partnerco.com",
    team: "Partner",
    roleNeeded: "External reviewer",
    businessReason: "Asked for access to customer-facing quotes during a joint pursuit.",
    requestedBy: "Self-serve request",
    status: "denied",
    createdAt: "2026-04-16T12:05:00.000Z",
    reviewedAt: "2026-04-16T16:30:00.000Z",
    reviewerName: "Casey Morgan",
    notes: "External access is not enabled in this phase. Route through exported proposal PDFs instead.",
  },
];

function stripPassword(user: AuthUser & { password: string }): AuthUser {
  const { password, ...safeUser } = user;
  void password;
  return safeUser;
}

export function getDirectoryUsers(): AuthUser[] {
  return users.map(stripPassword);
}

export function getUserByEmail(email: string): AuthUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  const match = users.find((user) => user.email.toLowerCase() === normalizedEmail);
  if (!match) return null;
  return stripPassword(match);
}

export function canSelfServeSignUp(email: string) {
  return email.trim().toLowerCase().endsWith("@inetlte.com");
}

export function buildSession(user: AuthUser): AuthSession {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + EIGHT_HOURS_MS);

  return {
    user,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export function isSessionExpired(session: AuthSession) {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export function deserializeAuthSession(value: string | null | undefined): AuthSession | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as AuthSession;
    if (!parsed?.user?.email || !parsed?.issuedAt || !parsed?.expiresAt) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function deserializeAccessRequests(value: string | null | undefined): AccessRequestRecord[] {
  if (!value) return seededAccessRequests;

  try {
    const parsed = JSON.parse(value) as AccessRequestRecord[];
    if (!Array.isArray(parsed)) {
      return seededAccessRequests;
    }

    return parsed;
  } catch {
    return seededAccessRequests;
  }
}

export function getSeededAccessRequests(): AccessRequestRecord[] {
  return seededAccessRequests;
}

export function buildAccessRequestId() {
  return `rq-access-${Math.random().toString(36).slice(2, 10)}`;
}

export function authenticateWithPassword(email: string, password: string): SignInResult {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const match = users.find((user) => user.email.toLowerCase() === normalizedEmail);

  if (!match || match.password !== normalizedPassword) {
    return {
      ok: false,
      error: "Email or password did not match. Please try again, reset your password, or request access if your account has not been provisioned yet.",
    };
  }

  if (match.status !== "active") {
    return {
      ok: false,
      error: "This account is not active yet. Check your invite status or contact the RapidQuote admin owner.",
    };
  }

  return {
    ok: true,
    session: buildSession(stripPassword(match)),
  };
}

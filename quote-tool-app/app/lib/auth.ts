export const AUTH_STORAGE_KEY = "rapidquote:auth-session";
export const ACCESS_REQUESTS_STORAGE_KEY = "rapidquote:access-requests";
export const USER_DIRECTORY_STORAGE_KEY = "rapidquote:user-directory";
export const ACCESS_AUDIT_STORAGE_KEY = "rapidquote:access-audit";

export type RapidQuoteRole = "sales" | "sales_ops" | "solutions_engineering" | "admin";
export type AccountStatus = "active" | "invited" | "pending_admin" | "suspended";
export type AccessRequestStatus = "pending" | "approved" | "needs_info" | "denied";
export type AccessAuditAction = "request_approved" | "request_denied" | "request_needs_info" | "user_created" | "role_changed" | "status_changed";

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

export type DirectoryUserRecord = AuthUser & { password: string };

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

export type AccessAuditRecord = {
  id: string;
  action: AccessAuditAction;
  actorName: string;
  actorEmail: string;
  targetName: string;
  targetEmail: string;
  createdAt: string;
  note: string;
};

const EIGHT_HOURS_MS = 1000 * 60 * 60 * 8;
const DEFAULT_PASSWORD = "RapidQuote!23";

const seededUsers: DirectoryUserRecord[] = [
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
    role: "admin",
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
  {
    id: "tracy-poindexter",
    name: "Tracy Poindexter",
    email: "tracy.poindexter@inetlte.com",
    title: "Account Executive",
    team: "Sales",
    role: "sales",
    status: "active",
    initials: "TP",
    canManageUsers: false,
    password: "RapidQuote!27",
  },
  {
    id: "mathew-clayton",
    name: "Mathew Clayton",
    email: "mattew.clayton@inetlte.com",
    title: "Account Executive",
    team: "Sales",
    role: "sales",
    status: "active",
    initials: "MC",
    canManageUsers: false,
    password: "RapidQuote!28",
  },
  {
    id: "xavier-trevino",
    name: "Xavier Trevino",
    email: "xavier.trevino@inetlte.com",
    title: "Account Executive",
    team: "Sales",
    role: "sales",
    status: "active",
    initials: "XT",
    canManageUsers: false,
    password: "RapidQuote!29",
  },
  {
    id: "michael-lam",
    name: "Michael Lam",
    email: "michael.lam@inetlte.com",
    title: "Account Executive",
    team: "Sales",
    role: "sales",
    status: "active",
    initials: "ML",
    canManageUsers: false,
    password: "RapidQuote!30",
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
    notes: "External access is limited to exported proposal files.",
  },
];

function stripPassword(user: DirectoryUserRecord): AuthUser {
  const { password, ...safeUser } = user;
  void password;
  return safeUser;
}

export function normalizeDirectoryUser(user: DirectoryUserRecord): DirectoryUserRecord {
  return {
    ...user,
    email: user.email.trim().toLowerCase(),
    initials: user.initials || buildInitials(user.name),
    canManageUsers: user.role === "admin",
    password: user.password || DEFAULT_PASSWORD,
  };
}

export function buildInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "RQ";
}

export function buildUserId(name: string, email: string) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = email.split("@")[0]?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || Math.random().toString(36).slice(2, 8);
  return `${base || "rapidquote-user"}-${suffix}`;
}

export function roleLabel(role: RapidQuoteRole) {
  switch (role) {
    case "admin":
      return "Admin";
    case "sales_ops":
      return "Sales Ops";
    case "solutions_engineering":
      return "Solutions Engineering";
    default:
      return "Sales";
  }
}

export function deserializeDirectoryUsers(value: string | null | undefined): DirectoryUserRecord[] {
  if (!value) return seededUsers.map(normalizeDirectoryUser);

  try {
    const parsed = JSON.parse(value) as DirectoryUserRecord[];
    if (!Array.isArray(parsed)) {
      return seededUsers.map(normalizeDirectoryUser);
    }

    const normalized = parsed
      .filter((user) => user?.id && user?.email && user?.name)
      .map(normalizeDirectoryUser);

    return normalized.length ? normalized : seededUsers.map(normalizeDirectoryUser);
  } catch {
    return seededUsers.map(normalizeDirectoryUser);
  }
}

export function getDirectoryUsers(): AuthUser[] {
  return getDirectoryUserRecords().map(stripPassword);
}

export function getDirectoryUserRecords(): DirectoryUserRecord[] {
  if (typeof window === "undefined") {
    return seededUsers.map(normalizeDirectoryUser);
  }

  return deserializeDirectoryUsers(window.localStorage.getItem(USER_DIRECTORY_STORAGE_KEY));
}

export function getUserByEmail(email: string): AuthUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  const match = getDirectoryUserRecords().find((user) => user.email.toLowerCase() === normalizedEmail);
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

    const directoryUser = getUserByEmail(parsed.user.email);
    if (!directoryUser || directoryUser.status !== "active") {
      return null;
    }

    return { ...parsed, user: directoryUser };
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

export function deserializeAccessAudit(value: string | null | undefined): AccessAuditRecord[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as AccessAuditRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSeededAccessRequests(): AccessRequestRecord[] {
  return seededAccessRequests;
}

export function buildAccessRequestId() {
  return `rq-access-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildAccessAuditId() {
  return `rq-audit-${Math.random().toString(36).slice(2, 10)}`;
}

export function inferRoleFromRequest(roleNeeded: string): RapidQuoteRole {
  const normalized = roleNeeded.toLowerCase();
  if (normalized.includes("admin")) return "admin";
  if (normalized.includes("ops") || normalized.includes("analyst")) return "sales_ops";
  if (normalized.includes("engineer") || normalized.includes("solution")) return "solutions_engineering";
  return "sales";
}

export function activeAdminCount(users: DirectoryUserRecord[]) {
  return users.filter((user) => user.status === "active" && user.role === "admin").length;
}

export function authenticateWithPassword(email: string, password: string): SignInResult {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const match = getDirectoryUserRecords().find((user) => user.email.toLowerCase() === normalizedEmail);

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
    session: buildSession(stripPassword(normalizeDirectoryUser(match))),
  };
}

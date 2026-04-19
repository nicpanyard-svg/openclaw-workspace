export const AUTH_STORAGE_KEY = "rapidquote:auth-session";

export type RapidQuoteRole = "sales" | "sales_ops" | "solutions_engineering" | "admin";
export type AccountStatus = "active" | "invited" | "pending_admin";

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
];

export const demoCredentials = {
  email: users[0].email,
  password: users[0].password,
};

export function getDirectoryUsers(): AuthUser[] {
  return users.map(({ password: _password, ...user }) => user);
}

export function getUserByEmail(email: string): AuthUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  const match = users.find((user) => user.email.toLowerCase() === normalizedEmail);
  if (!match) return null;
  const { password: _password, ...safeUser } = match;
  return safeUser;
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

export function authenticateWithPassword(email: string, password: string): SignInResult {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();
  const match = users.find((user) => user.email.toLowerCase() === normalizedEmail);

  if (!match || match.password !== normalizedPassword) {
    return {
      ok: false,
      error: "Email or password did not match. Use your @inetlte.com account or the seeded demo login for this stage.",
    };
  }

  const { password: _password, ...safeUser } = match;
  return {
    ok: true,
    session: buildSession(safeUser),
  };
}

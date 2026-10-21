import { createHash, timingSafeEqual } from "node:crypto";

function equal(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

// Optional deployment gate for a restricted pilot. This is not per-user identity/RBAC.
// Keep the current local workflow until DevOps explicitly enables the gate.
export function checkServerAccess(request: Request): Response | null {
  const mode = process.env.RAPIDQUOTE_ACCESS_MODE;
  if (!mode || mode === "local") return null;
  if (mode !== "restricted") return Response.json({ error: "Invalid deployment access mode." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const user = process.env.RAPIDQUOTE_ACCESS_USER;
  const password = process.env.RAPIDQUOTE_ACCESS_PASSWORD;
  if (!user || !password || password.length < 20 || user.includes(":")) {
    return Response.json({ error: "Deployment access is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
  if (!equal(provided, expected)) return Response.json({ error: "Deployment sign-in required." }, {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RapidQuote pilot", charset="UTF-8"', "Cache-Control": "no-store" },
  });
  return null;
}

export function getPdfOrigin(request: Request) {
  const configured = process.env.RAPIDQUOTE_APP_ORIGIN;
  const url = new URL(configured || request.url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((!configured && !loopback) || (!loopback && url.protocol !== "https:") ||
      url.username || url.password || (configured && (url.pathname !== "/" || url.search || url.hash))) {
    throw new Error("Configure RAPIDQUOTE_APP_ORIGIN to the trusted application origin.");
  }
  return url.origin;
}

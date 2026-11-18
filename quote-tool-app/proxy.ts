import { NextResponse, type NextRequest } from "next/server";
import { checkServerAccess } from "./app/lib/server-access";
import { buildContentSecurityPolicy } from "./app/lib/content-security-policy";

export function proxy(request: NextRequest) {
  const denied = checkServerAccess(request);
  if (denied) return denied;
  if (request.nextUrl.pathname.startsWith("/api/") || request.nextUrl.pathname.startsWith("/_next/")) return NextResponse.next();

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: "/:path*" };

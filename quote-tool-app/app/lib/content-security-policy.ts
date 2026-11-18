export function buildContentSecurityPolicy(nonce: string, development = false) {
  if (!/^[A-Za-z0-9+/=_-]{22,128}$/.test(nonce)) throw new Error("Invalid script nonce.");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // Existing React styles and generated document previews use inline styles, not scripts.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: blob: data:",
    "font-src 'self' data:",
    `connect-src 'self' https: blob: data:${development ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data: https://login.microsoftonline.com",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

import type { NextConfig } from "next";
const workspaceRoot = process.cwd();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "same-origin" },
    ] }];
  },
  allowedDevOrigins: ["127.0.0.1", "localhost", "100.93.175.20"],
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingRoot: workspaceRoot,
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/proposal-pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;

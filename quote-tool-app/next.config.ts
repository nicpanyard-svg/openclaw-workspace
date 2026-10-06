import type { NextConfig } from "next";
const workspaceRoot = process.cwd();

const nextConfig: NextConfig = {
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

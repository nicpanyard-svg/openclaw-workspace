import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    MS_GRAPH_CONFIG: "C:\\Users\\IkeFl\\.openclaw\\workspace\\config\\ms-graph.json",
  },
  turbopack: {
    root: "C:\\Users\\IkeFl\\.openclaw\\workspace\\mission-control-app",
  },
};

export default nextConfig;

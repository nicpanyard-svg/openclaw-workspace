const fs = require("node:fs");
const path = require("node:path");

const nextDir = path.join(process.cwd(), ".next");
const routesManifest = path.join(nextDir, "routes-manifest.json");
const deterministicManifest = path.join(nextDir, "routes-manifest-deterministic.json");

if (!fs.existsSync(nextDir)) {
  console.error("Expected .next build output before ensuring Vercel routes manifest.");
  process.exit(1);
}

if (fs.existsSync(deterministicManifest)) {
  console.log("Vercel deterministic routes manifest already present.");
  process.exit(0);
}

if (!fs.existsSync(routesManifest)) {
  console.error("Missing .next/routes-manifest.json; cannot create deterministic manifest fallback.");
  process.exit(1);
}

fs.copyFileSync(routesManifest, deterministicManifest);
console.log("Created .next/routes-manifest-deterministic.json from routes-manifest.json");

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function findTests(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? findTests(file) : /\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}
const tests = findTests(path.join(root, "app")).sort();
if (!tests.length) throw new Error("No tests found.");
const result = spawnSync(process.execPath, [
  "--import", "tsx",
  "--test", "--test-concurrency=2", ...tests,
], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "test", NEXT_PUBLIC_RAPIDQUOTE_ENV: "inet" } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);

#!/usr/bin/env node
/**
 * Mission Control Uptime Monitor (T15)
 * - Checks http://localhost:3000 every 15 minutes
 * - If down: kills process on port 3000 by PID, restarts npm run dev
 * - Logs events to data/error-log.json via POST /api/errors
 * - Sends alert email via openclaw gog (if available)
 *
 * Run: node scripts/uptime-monitor.js
 * Or register as openclaw cron every 15 min: openclaw cron add "0,15,30,45 * * * *" "node ..."
 */

const http = require("http");
const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const APP_DIR = path.resolve(__dirname, "..");
const APP_URL = "http://localhost:3000";
const PORT = 3000;
const ALERT_EMAIL = "nick.panyard@inetlte.com";
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const ERROR_LOG_API = "http://localhost:3000/api/errors";

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function logError(severity, message) {
  try {
    // Write directly to file if API is down
    const logPath = path.join(APP_DIR, "data", "error-log.json");
    const existing = JSON.parse(fs.readFileSync(logPath, "utf-8") || "[]");
    existing.push({
      id: `err-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: "uptime-monitor",
      severity,
      message,
    });
    if (existing.length > 1000) existing.splice(0, existing.length - 1000);
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
  } catch (e) {
    log(`Could not write to error log: ${e.message}`);
  }
}

function getPidOnPort(port) {
  try {
    const result = execSync(
      `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -ExpandProperty OwningProcess`,
      { shell: "powershell.exe", encoding: "utf-8" }
    ).trim();
    const pid = parseInt(result, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function killPid(pid) {
  try {
    execSync(`Stop-Process -Id ${pid} -Force`, { shell: "powershell.exe" });
    log(`Killed PID ${pid}`);
    return true;
  } catch (e) {
    log(`Failed to kill PID ${pid}: ${e.message}`);
    return false;
  }
}

function restartApp() {
  log("Starting Mission Control (npm run dev)...");
  const child = spawn("npm", ["run", "dev"], {
    cwd: APP_DIR,
    detached: true,
    stdio: "ignore",
    shell: true,
  });
  child.unref();
  log(`Spawned npm run dev (pid ${child.pid})`);
}

function sendAlert(subject, body) {
  try {
    execSync(
      `openclaw gog email send --to "${ALERT_EMAIL}" --subject "${subject}" --body "${body}"`,
      { shell: "powershell.exe", timeout: 15000 }
    );
    log(`Alert email sent to ${ALERT_EMAIL}`);
  } catch (e) {
    log(`Could not send alert email: ${e.message}`);
  }
}

async function check() {
  log(`Checking ${APP_URL}...`);
  const up = await checkUrl(APP_URL);

  if (up) {
    log("Mission Control is UP ✓");
    return;
  }

  log("⚠️  Mission Control is DOWN — attempting recovery...");
  await logError("error", "Mission Control (localhost:3000) is DOWN. Attempting restart.");
  sendAlert("⚠️ Mission Control is DOWN", "Mission Control at http://localhost:3000 is not responding. Attempting auto-restart now.");

  const pid = getPidOnPort(PORT);
  if (pid) {
    log(`Found process on port ${PORT}: PID ${pid}`);
    killPid(pid);
    // Wait a moment after kill
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    log(`No process found on port ${PORT}`);
  }

  restartApp();
  await logError("info", "Mission Control restart triggered by uptime-monitor.");
  log("Restart triggered. Will verify on next check cycle.");
}

// Run immediately, then on interval
check();
setInterval(check, CHECK_INTERVAL_MS);

log(`Uptime monitor running. Checking every 15 minutes. PID: ${process.pid}`);

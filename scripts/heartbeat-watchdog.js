#!/usr/bin/env node
'use strict';

const { readFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');

const SESSIONS_FILE = 'C:\\Users\\IkeFl\\.openclaw\\agents\\main\\sessions\\sessions.json';
const MAIN_SESSION_KEY = 'agent:main:telegram:direct:8525960420';
const ALERT_EMAIL = 'nick.panyard@inetlte.com';
const THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

function run() {
  if (!existsSync(SESSIONS_FILE)) {
    console.error('[heartbeat-watchdog] Sessions file not found:', SESSIONS_FILE);
    process.exit(1);
  }

  let sessions;
  try {
    sessions = JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch (err) {
    console.error('[heartbeat-watchdog] Failed to parse sessions.json:', err.message);
    process.exit(1);
  }

  const session = sessions[MAIN_SESSION_KEY];
  if (!session) {
    console.error('[heartbeat-watchdog] Main session key not found:', MAIN_SESSION_KEY);
    process.exit(1);
  }

  const lastActiveMs = session.updatedAt;
  const now = Date.now();
  const elapsedMs = now - lastActiveMs;
  const elapsedMin = Math.round(elapsedMs / 60000);
  const lastActiveStr = new Date(lastActiveMs).toISOString();

  if (elapsedMs >= THRESHOLD_MS) {
    console.log(`[heartbeat-watchdog] ALERT: Main agent silent for ${elapsedMin} minutes. Last active: ${lastActiveStr}`);

    const subject = 'ALERT: Ike has been silent for 30+ minutes';
    const body = `OpenClaw main agent appears unresponsive. Last activity: ${lastActiveStr}. Check the gateway and restart if needed.`;

    try {
      execSync(
        `gog send-email to:${ALERT_EMAIL} subject:"${subject}" body:"${body}"`,
        { stdio: 'inherit' }
      );
      console.log('[heartbeat-watchdog] Alert email sent.');
    } catch (err) {
      console.error('[heartbeat-watchdog] Failed to send alert email:', err.message);
      process.exit(1);
    }
  } else {
    console.log(`[heartbeat-watchdog] OK: Main agent last active ${elapsedMin} minute(s) ago (${lastActiveStr}).`);
  }
}

run();

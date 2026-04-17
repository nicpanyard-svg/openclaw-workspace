#!/usr/bin/env node
// slack-socket-watchdog.js — checks Slack socket connection, restarts gateway if disconnected
// Run via cron every 5 minutes

const { execSync, execFileSync } = require('child_process');
const path = require('path');

const LOG = path.join(__dirname, '..', 'monitoring', 'slack-watchdog.log');
const fs = require('fs');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG, line + '\n');
  } catch (_) {}
}

function getSlackStatus() {
  try {
    const raw = execSync('openclaw channels status --json', {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true
    });
    // Strip any non-JSON prefix (openclaw sometimes emits warnings before JSON)
    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1) return null;
    return JSON.parse(raw.slice(jsonStart));
  } catch (err) {
    log(`ERROR reading channel status: ${err.message}`);
    return null;
  }
}

function restartGateway() {
  try {
    log('Restarting OpenClaw gateway daemon...');
    execSync('openclaw daemon restart', {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true
    });
    log('Gateway restart issued. Waiting 10s for Slack to reconnect...');
    // Wait 10s then confirm
    setTimeout(() => {
      const status = getSlackStatus();
      if (status) {
        const slackAccounts = status.channelAccounts?.slack || [];
        const running = slackAccounts.some(a => a.running);
        log(running ? 'Slack reconnected successfully.' : 'WARNING: Slack still not running after restart.');
      }
    }, 10000);
  } catch (err) {
    log(`ERROR restarting gateway: ${err.message}`);
  }
}

function main() {
  const status = getSlackStatus();
  if (!status) {
    log('Could not get channel status. Skipping.');
    process.exit(0);
  }

  const slackAccounts = status.channelAccounts?.slack || [];
  if (slackAccounts.length === 0) {
    log('No Slack accounts configured.');
    process.exit(0);
  }

  const slackRunning = slackAccounts.some(a => a.running === true);

  if (slackRunning) {
    log('Slack socket: OK (running)');
    process.exit(0);
  } else {
    log('Slack socket: DOWN — triggering gateway restart');
    restartGateway();
  }
}

main();

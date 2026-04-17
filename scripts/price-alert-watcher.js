#!/usr/bin/env node
/**
 * price-alert-watcher.js
 * Graham's live price alert system for Mission Control
 *
 * - Reads alert configs from data/alerts.json
 * - Fetches prices from Yahoo Finance every 60s during market hours
 * - Posts alert messages to Mission Control API (taskId: t47)
 * - Logs fired alerts to data/fired-alerts.json
 *
 * Market hours: 9:30 AM – 4:00 PM ET, weekdays only
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = path.resolve(__dirname, '..');
const ALERTS_FILE = path.join(WORKSPACE, 'data', 'alerts.json');
const FIRED_FILE = path.join(WORKSPACE, 'data', 'fired-alerts.json');
const TASK_ID = 't47';
const MC_API = 'http://localhost:3000/api/tasks/messages';
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds
const SLEEP_CHECK_MS = 30 * 1000;   // recheck every 30s when outside market hours

// ─── Alert type metadata ────────────────────────────────────────────────────
const ALERT_META = {
  stop_loss:   { emoji: '🛑', label: 'Stop Loss Hit',         compare: (price, trigger) => price <= trigger },
  starter_buy: { emoji: '🟢', label: 'Starter Buy Zone',      compare: (price, trigger) => price <= trigger },
  breakout:    { emoji: '🚀', label: 'Breakout Above Level',   compare: (price, trigger) => price >= trigger },
  breakdown:   { emoji: '📉', label: 'Breakdown Below Level',  compare: (price, trigger) => price <= trigger },
};

// ─── Market hours check (ET) ────────────────────────────────────────────────
function isMarketHours() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  // Convert to ET (UTC-5 EST / UTC-4 EDT)
  const etOffset = isDST(now) ? -4 : -5;
  const etHour = now.getUTCHours() + etOffset;
  const etMinutes = now.getUTCMinutes();
  const etTotal = etHour * 60 + etMinutes;

  const open  = 9 * 60 + 30;   // 9:30 AM
  const close = 16 * 60;        // 4:00 PM

  return etTotal >= open && etTotal < close;
}

function isDST(date) {
  // US DST: 2nd Sunday of March → 1st Sunday of November
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.min(jan, jul) === date.getTimezoneOffset();
}

function etTimeString() {
  const now = new Date();
  const etOffset = isDST(now) ? -4 : -5;
  const et = new Date(now.getTime() + etOffset * 3600 * 1000);
  return et.toISOString().replace('T', ' ').substring(0, 19) + ' ET';
}

// ─── Load / save helpers ────────────────────────────────────────────────────
function loadAlerts() {
  try {
    const raw = fs.readFileSync(ALERTS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[ALERT WATCHER] Failed to load alerts.json:', err.message);
    return [];
  }
}

function loadFiredAlerts() {
  try {
    const raw = fs.readFileSync(FIRED_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveFiredAlerts(fired) {
  fs.writeFileSync(FIRED_FILE, JSON.stringify(fired, null, 2));
}

// Track which alerts have fired this session (key = ticker+type+price)
// We use fired-alerts.json for persistence across restarts
function alertKey(alert) {
  return `${alert.ticker}__${alert.type}__${alert.price}`;
}

// ─── Price fetch from Yahoo Finance ─────────────────────────────────────────
async function fetchPrice(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1m&range=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose;
    if (!price) throw new Error('No price in response');
    return parseFloat(price);
  } catch (err) {
    console.error(`[ALERT WATCHER] Price fetch failed for ${ticker}:`, err.message);
    return null;
  }
}

// ─── Post message to Mission Control ────────────────────────────────────────
async function postAlert(alert, currentPrice) {
  const meta = ALERT_META[alert.type] || { emoji: '⚠️', label: alert.type };
  const direction = (alert.type === 'breakout') ? 'above' : 'at or below';
  const summary =
    `${meta.emoji} **${meta.label}: ${alert.ticker}**\n` +
    `Current price: $${currentPrice.toFixed(2)} (trigger: $${alert.price})\n` +
    `Note: ${alert.note}\n` +
    `Time: ${etTimeString()}`;

  const payload = {
    taskId: TASK_ID,
    role: 'assistant',
    content: summary,
    agentId: 'graham',
  };

  try {
    const res = await fetch(MC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[ALERT WATCHER] MC API error ${res.status}:`, text);
    } else {
      console.log(`[ALERT WATCHER] ✅ Alert posted to Mission Control: ${alert.ticker} ${alert.type}`);
    }
  } catch (err) {
    console.error('[ALERT WATCHER] Failed to post alert:', err.message);
  }
}

// ─── Main check loop ─────────────────────────────────────────────────────────
async function checkAlerts() {
  const alerts = loadAlerts();
  if (!alerts.length) {
    console.log('[ALERT WATCHER] No alerts configured.');
    return;
  }

  const firedAlerts = loadFiredAlerts();
  const firedKeys = new Set(firedAlerts.map(a => alertKey(a)));

  // Deduplicate tickers to minimize API calls
  const tickers = [...new Set(alerts.map(a => a.ticker.toUpperCase()))];
  const prices = {};

  console.log(`[ALERT WATCHER] Checking ${tickers.length} ticker(s): ${tickers.join(', ')}`);

  for (const ticker of tickers) {
    const price = await fetchPrice(ticker);
    if (price !== null) {
      prices[ticker] = price;
      console.log(`  ${ticker}: $${price.toFixed(2)}`);
    }
    // Small stagger to be polite to Yahoo
    await sleep(500);
  }

  const newFired = [];

  for (const alert of alerts) {
    const ticker = alert.ticker.toUpperCase();
    const currentPrice = prices[ticker];
    if (currentPrice === null || currentPrice === undefined) continue;

    const key = alertKey(alert);
    if (firedKeys.has(key)) {
      // Already fired — skip (reset fired-alerts.json to re-enable)
      continue;
    }

    const meta = ALERT_META[alert.type];
    if (!meta) {
      console.warn(`[ALERT WATCHER] Unknown alert type: ${alert.type}`);
      continue;
    }

    if (meta.compare(currentPrice, alert.price)) {
      console.log(`[ALERT WATCHER] 🔔 ALERT TRIGGERED: ${ticker} ${alert.type} @ $${currentPrice.toFixed(2)} (trigger: $${alert.price})`);
      await postAlert({ ...alert, ticker }, currentPrice);

      const firedEntry = {
        ...alert,
        ticker,
        firedAt: new Date().toISOString(),
        firedPrice: currentPrice,
      };
      firedAlerts.push(firedEntry);
      newFired.push(firedEntry);
      firedKeys.add(key);
    }
  }

  if (newFired.length > 0) {
    saveFiredAlerts(firedAlerts);
    console.log(`[ALERT WATCHER] Saved ${newFired.length} new fired alert(s) to fired-alerts.json`);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Entry point ─────────────────────────────────────────────────────────────
async function main() {
  console.log('====================================================');
  console.log(' Graham Price Alert Watcher — Mission Control');
  console.log(`  Alerts file : ${ALERTS_FILE}`);
  console.log(`  Fired log   : ${FIRED_FILE}`);
  console.log(`  Poll interval: 60s during market hours (9:30-4:00 ET)`);
  console.log('====================================================\n');

  while (true) {
    if (isMarketHours()) {
      console.log(`[${new Date().toISOString()}] Market is OPEN — checking prices...`);
      try {
        await checkAlerts();
      } catch (err) {
        console.error('[ALERT WATCHER] Unexpected error in checkAlerts:', err);
      }
      await sleep(POLL_INTERVAL_MS);
    } else {
      console.log(`[${new Date().toISOString()}] Market is CLOSED — sleeping...`);
      await sleep(SLEEP_CHECK_MS);
    }
  }
}

main().catch(err => {
  console.error('[ALERT WATCHER] Fatal error:', err);
  process.exit(1);
});

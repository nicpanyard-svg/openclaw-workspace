#!/usr/bin/env node
// board-watcher.js — watches Graham board JSON files and triggers sync on change
// Debounce: 2 seconds between syncs

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const WORKSPACE = path.join(__dirname, '..');
const SYNC_SCRIPT = path.join(WORKSPACE, 'sync-stock-board.js');
const DEBOUNCE_MS = 2000;

const WATCHED_FILES = [
  path.join(WORKSPACE, 'graham-stock-board', 'paper-trades.json'),
  path.join(WORKSPACE, 'graham-stock-board', 'board.seed.json'),
  path.join(WORKSPACE, 'graham-stock-board', 'alerts.json'),
  path.join(WORKSPACE, 'graham-stock-board', 'day-trades.json'),
];

let syncTimer = null;
let pendingFile = null;

function runSync(filename) {
  execFile(process.execPath, [SYNC_SCRIPT], (err, stdout, stderr) => {
    const time = new Date().toISOString();
    if (err) {
      console.error(`[${time}] Sync ERROR for ${filename}: ${err.message}`);
      if (stderr) console.error(stderr.trim());
    } else {
      console.log(`Board synced: ${filename} changed at ${time}`);
      if (stdout) process.stdout.write(stdout);
    }
  });
}

function scheduleSync(filename) {
  pendingFile = filename;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    runSync(pendingFile);
  }, DEBOUNCE_MS);
}

console.log(`[${new Date().toISOString()}] Board watcher started — watching ${WATCHED_FILES.length} files`);

WATCHED_FILES.forEach(filePath => {
  const filename = path.basename(filePath);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filename} does not exist yet, will watch once created`);
  }
  try {
    fs.watch(filePath, { persistent: true }, (event) => {
      if (event === 'change' || event === 'rename') {
        scheduleSync(filename);
      }
    });
    console.log(`  Watching: ${filename}`);
  } catch (e) {
    // File may not exist yet; watch the directory for it
    const dir = path.dirname(filePath);
    fs.watch(dir, { persistent: true }, (event, changedFile) => {
      if (changedFile === filename && (event === 'change' || event === 'rename')) {
        scheduleSync(filename);
      }
    });
    console.log(`  Watching dir for: ${filename}`);
  }
});

console.log('Watcher running. Press Ctrl+C to stop.');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\nBoard watcher stopped.');
  process.exit(0);
});

#!/usr/bin/env node
// Syncs graham-stock-board files to mission-control-app/public/graham-board
// Run this after any Graham board update

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'graham-stock-board');
const dst = path.join(__dirname, 'mission-control-app', 'public', 'graham-board');

const files = ['index.html', 'paper-trades.json', 'board.seed.json', 'alerts.json'];

files.forEach(file => {
  const srcPath = path.join(src, file);
  const dstPath = path.join(dst, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, dstPath);
    console.log(`Synced: ${file}`);
  }
});

console.log('Graham board synced to Mission Control public folder.');

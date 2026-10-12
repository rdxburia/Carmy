#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const nextTag = process.argv[2];

if (!nextTag || !/^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[a-z0-9-]+$/.test(nextTag)) {
  console.error('Usage: node scripts/bump-build.cjs YYYY.MM.DD-label');
  process.exit(1);
}

const indexPath = path.join(root, 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');
const meta = html.match(/<meta name="carmy-build" content="([^"]+)">/);

if (!meta) {
  throw new Error('Missing meta[name="carmy-build"] in index.html');
}

const oldTag = meta[1];
if (oldTag === nextTag) {
  console.log('Build tag already current:', nextTag);
  process.exit(0);
}

const updated = html.replaceAll(oldTag, nextTag);
if (updated.includes(oldTag)) {
  throw new Error('Some old build-tag references remain in index.html');
}

const metaAfter = updated.match(/<meta name="carmy-build" content="([^"]+)">/);
if (!metaAfter || metaAfter[1] !== nextTag) {
  throw new Error('Build metadata did not update correctly');
}

fs.writeFileSync(indexPath, updated);
console.log('Updated all index.html build references:', oldTag, '->', nextTag);
console.log('js/build-info.js reads this meta tag dynamically; no hard-coded version is required there.');

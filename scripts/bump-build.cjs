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
let html = fs.readFileSync(indexPath, 'utf8');
const meta = html.match(/<meta name="carmy-build" content="([^"]+)">/);

if (!meta) {
  throw new Error('Missing meta[name="carmy-build"] in index.html');
}

const oldTag = meta[1];
html = html.replace(/(<meta name="carmy-build" content=")[^"]+(")/, `$1${nextTag}$2`);
html = html.replace(/([?&]v=)[^"'&\s]+/g, `$1${nextTag}`);

const metaAfter = html.match(/<meta name="carmy-build" content="([^"]+)">/);
if (!metaAfter || metaAfter[1] !== nextTag) {
  throw new Error('Build metadata did not update correctly');
}

const remainingAssetVersions = [...html.matchAll(/[?&]v=([^"'&\s]+)/g)]
  .map(match => match[1])
  .filter(version => version !== nextTag);
if (remainingAssetVersions.length) {
  throw new Error('Inconsistent asset build versions remain: ' + remainingAssetVersions.join(', '));
}

fs.writeFileSync(indexPath, html);
console.log('Updated build tag:', oldTag, '->', nextTag);
console.log('Updated meta carmy-build and all versioned asset URLs in index.html.');
console.log('js/build-info.js reads the meta tag dynamically.');

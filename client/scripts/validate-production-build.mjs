#!/usr/bin/env node
/**
 * Validates Vite production build output (run after npm run build).
 */
import fs from 'fs';
import path from 'path';

const distDir = path.resolve(process.cwd(), 'dist');
const indexPath = path.join(distDir, 'index.html');
const assetsDir = path.join(distDir, 'assets');

function fail(message) {
  console.error(`[build:validate] ERROR: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  fail('dist/index.html not found — run npm run build first.');
}

const indexHtml = fs.readFileSync(indexPath, 'utf8');
if (!indexHtml.includes('__MRB_ADMIN_SHELL__')) {
  fail('Admin shell injection missing from dist/index.html.');
}

if (!fs.existsSync(assetsDir)) {
  fail('dist/assets/ directory missing.');
}

const assetFiles = fs.readdirSync(assetsDir);
const jsBundles = assetFiles.filter((f) => f.endsWith('.js'));
if (jsBundles.length === 0) {
  fail('No JS bundles in dist/assets/.');
}

console.log('[build:validate] Production build OK.', {
  jsBundles: jsBundles.length,
  totalAssets: assetFiles.length,
});

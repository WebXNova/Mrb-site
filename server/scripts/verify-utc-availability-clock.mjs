/**
 * Static verification — unified UTC clock for availability enforcement.
 * Run: node scripts/verify-utc-availability-clock.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function ok(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail = '') {
  throw new Error(`${label}${detail ? `: ${detail}` : ''}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) fail(label, `missing ${pattern}`);
  ok(label);
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) fail(label, `unexpected ${pattern}`);
  ok(label);
}

console.log('UTC availability clock verification\n');

assertMatch(
  'getAvailabilityNowMs exported',
  read('src/services/testAvailabilityWindow.service.js'),
  /export async function getAvailabilityNowMs/
);

assertMatch(
  'prep uses getAvailabilityNowMs',
  read('src/services/testInstructionsPrep.service.js'),
  /getAvailabilityNowMs\(mysqlPool\)/
);

assertMatch(
  'secureAttemptContext uses getAvailabilityNowMs',
  read('src/services/testAttempt/secureAttemptContext.js'),
  /getAvailabilityNowMs\(executor\)/
);

assertMatch(
  'secureAttemptContext passes nowMs to window assert',
  read('src/services/testAttempt/secureAttemptContext.js'),
  /nowMs,\s*\n\s*attemptStartedAt: ctx\.attempt\.started_at/
);

assertMatch(
  'portal preview uses getAvailabilityNowMs',
  read('src/services/studentTestStart.service.js'),
  /previewNowMs = await getAvailabilityNowMs/
);

assertNoMatch(
  'slug create resume expiry avoids Date.now',
  read('src/services/testAttempt.service.js'),
  /expireAttemptIfExpired\(\{\s*\n\s*attemptId: activeAttempt\.id,\s*\n\s*nowMs: Date\.now\(\)/
);

assertMatch(
  'test settings write uses formatMySqlDateTime',
  read('src/services/test.service.js'),
  /formatMySqlDateTime\(payload\.start_date/
);

assertMatch(
  'expiry SQL uses UTC_TIMESTAMP',
  read('src/services/attemptTimer.queries.js'),
  /expires_at < UTC_TIMESTAMP\(\)/
);

assertMatch(
  'attempt timer parser delegates to availability UTC parser',
  read('src/services/attemptTiming.service.js'),
  /parseTestAvailabilityInstant/
);

console.log('\nAll UTC availability clock checks passed.');

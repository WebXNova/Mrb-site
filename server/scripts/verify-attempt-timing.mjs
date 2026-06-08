/**
 * Static verification for attempt timing (no instant expiry regression).
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function ok(msg) {
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.error(`  ✗ ${msg}`);
}

console.log('Attempt timing verification\n');

const entitledInsert = await fs.readFile(
  path.join(root, '../src/services/testAttempt.queries.js'),
  'utf8'
);
const studentInsert = await fs.readFile(
  path.join(root, '../src/services/studentTestStart.queries.js'),
  'utf8'
);
const expireSql = await fs.readFile(
  path.join(root, '../src/services/attemptTimer.queries.js'),
  'utf8'
);

for (const [label, src] of [
  ['entitled insert', entitledInsert],
  ['student insert', studentInsert],
]) {
  if (
    src.includes('CURRENT_TIMESTAMP') &&
    src.includes('DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)')
  ) {
    ok(`${label} uses MySQL clock for started_at and expires_at`);
  } else {
    fail(`${label} missing DATE_ADD timing strategy`);
  }
}

if (expireSql.includes('expires_at < NOW()')) {
  ok('expiry update compares against MySQL NOW()');
} else {
  fail('expiry SQL still uses bound JS timestamp');
}

const attemptService = await fs.readFile(
  path.join(root, '../src/services/testAttempt.service.js'),
  'utf8'
);
if (
  attemptService.includes('assertValidTestDurationMinutes') &&
  attemptService.includes('logAttemptTimeCalculation') &&
  !attemptService.includes('formatMySqlDateTime')
) {
  ok('public attempt creation validates duration and avoids JS UTC formatting');
} else {
  fail('public attempt service timing fix incomplete');
}

const studentService = await fs.readFile(
  path.join(root, '../src/services/studentTestStart.service.js'),
  'utf8'
);
if (
  studentService.includes('assertValidTestDurationMinutes') &&
  !studentService.includes('formatMySqlDateTime')
) {
  ok('student attempt creation uses shared duration validation');
} else {
  fail('student attempt service timing fix incomplete');
}

const timerValidation = await fs.readFile(
  path.join(root, '../src/services/attemptTimerValidation.service.js'),
  'utf8'
);
if (timerValidation.includes('parseMySqlDateTimeToMs')) {
  ok('timer validation parses MySQL local datetimes consistently');
} else {
  fail('timer validation parser missing');
}

const expiryService = await fs.readFile(
  path.join(root, '../src/services/attemptExpiry.service.js'),
  'utf8'
);
if (!expiryService.includes('formatMySqlDateTime')) {
  ok('expiry service no longer formats UTC comparison timestamps');
} else {
  fail('expiry service still uses formatMySqlDateTime');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

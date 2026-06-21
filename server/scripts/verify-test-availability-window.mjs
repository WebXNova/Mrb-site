/**
 * G-RT-03 static verification — availability window wired across student runtime.
 * Run: node scripts/verify-test-availability-window.mjs
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

console.log('G-RT-03 — test availability window verification\n');

assertMatch(
  'central service exists',
  read('src/services/testAvailabilityWindow.service.js'),
  /export function assertTestAvailabilityWindow/
);

assertMatch(
  'slug create uses LOCK + window assert',
  read('src/services/testAttempt.service.js'),
  /LOCK_ENTITLED_TEST_FOR_START_SQL/
);

assertMatch(
  'slug create INSERT SQL window guard',
  read('src/services/testAttempt.queries.js'),
  /TEST_AVAILABILITY_CREATE_WHERE_SQL/
);

assertMatch(
  'secureAttemptContext loads start_date/end_date',
  read('src/services/testAttempt/secureAttemptContext.js'),
  /t\.start_date/
);

assertMatch(
  'secureAttemptContext enforces IN_PROGRESS window',
  read('src/services/testAttempt/secureAttemptContext.js'),
  /AVAILABILITY_PHASE\.IN_PROGRESS/
);

assertMatch(
  'portal start INSERT uses window guard',
  read('src/services/studentTestStart.queries.js'),
  /TEST_AVAILABILITY_CREATE_WHERE_SQL/
);

assertMatch(
  'portal start resume uses IN_PROGRESS phase',
  read('src/services/studentTestStart.service.js'),
  /AVAILABILITY_PHASE\.IN_PROGRESS/
);

assertMatch(
  'answer save path loads window columns',
  read('src/services/studentAttemptLoad.queries.js'),
  /t\.start_date/
);

assertMatch(
  'prep enforces ANY_ACCESS',
  read('src/services/testInstructionsPrep.service.js'),
  /AVAILABILITY_PHASE\.ANY_ACCESS/
);

assertMatch(
  'prep exposes availability snapshot',
  read('src/services/testInstructionsPrep.service.js'),
  /availability:/
);

console.log('\nAll G-RT-03 availability window checks passed.');

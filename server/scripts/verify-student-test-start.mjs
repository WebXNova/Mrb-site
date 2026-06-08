/**
 * Static verification for POST /api/student/tests/:testId/start (Phase 2A).
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

console.log('Student test start API verification\n');

const routesSrc = await fs.readFile(path.join(root, '../src/routes/student.routes.js'), 'utf8');
if (routesSrc.includes("router.post('/tests/:testId/start', postStudentTestStart)")) {
  ok('route POST /tests/:testId/start registered');
} else {
  fail('start route missing');
}

const { postStudentTestStart } = await import('../src/controllers/studentTests.controller.js');
const { startOrResumeStudentTest } = await import('../src/services/studentTestStart.service.js');
const { assertStudentOwnsTest } = await import('../src/services/testOwnership.service.js');
const { studentOwnsAttempt } = await import('../src/services/attemptOwnership.service.js');

if (typeof postStudentTestStart === 'function') ok('controller exported');
else fail('controller missing');

if (typeof startOrResumeStudentTest === 'function') ok('service exported');
else fail('service missing');

if (typeof assertStudentOwnsTest === 'function') ok('assertStudentOwnsTest exported');
else fail('assertStudentOwnsTest missing');

if (typeof studentOwnsAttempt === 'function') ok('studentOwnsAttempt exported');
else fail('studentOwnsAttempt missing');

const queriesSrc = await fs.readFile(path.join(root, '../src/services/studentTestStart.queries.js'), 'utf8');
if (queriesSrc.includes('FOR UPDATE') && queriesSrc.includes('INSERT INTO test_attempts')) {
  ok('transaction SQL includes row locks and insert');
} else {
  fail('transaction SQL incomplete');
}

if (queriesSrc.includes('attempt_number') && queriesSrc.includes('student_id')) {
  ok('insert includes student_id and attempt_number');
} else {
  fail('insert missing required attempt fields');
}

if (
  queriesSrc.includes('DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)') &&
  queriesSrc.includes('CURRENT_TIMESTAMP')
) {
  ok('insert derives expires_at from MySQL clock');
} else {
  fail('insert missing MySQL DATE_ADD expiry strategy');
}

const serviceSrc = await fs.readFile(path.join(root, '../src/services/studentTestStart.service.js'), 'utf8');
if (serviceSrc.includes('beginTransaction') && serviceSrc.includes('LOCK_ACTIVE_ATTEMPT_SQL')) {
  ok('service uses transaction with active attempt lock');
} else {
  fail('transaction strategy missing');
}

if (serviceSrc.includes('assertStudentOwnsTest') && serviceSrc.includes('validateTestExistsAndPublished')) {
  ok('validation flow present');
} else {
  fail('validation flow missing');
}

if (serviceSrc.includes('ER_DUP_ENTRY')) ok('duplicate attempt race handled');
else fail('race condition handler missing');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

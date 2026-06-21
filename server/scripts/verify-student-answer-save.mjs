/**
 * Static verification for POST /api/student/attempts/:attemptId/answer (Phase 2C).
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

console.log('Student answer save API verification\n');

const routesSrc = await fs.readFile(path.join(root, '../src/routes/student.routes.js'), 'utf8');
if (
  routesSrc.includes("'/attempts/:attemptId/answer'") &&
  routesSrc.includes('requireCsrf') &&
  routesSrc.includes('postStudentAttemptAnswer')
) {
  ok('route POST /attempts/:attemptId/answer registered with CSRF');
} else {
  fail('save answer route missing CSRF protection');
}

const { postStudentAttemptAnswer } = await import('../src/controllers/studentAttempts.controller.js');
const { saveStudentAttemptAnswer } = await import('../src/services/studentAnswerSave.service.js');

if (typeof postStudentAttemptAnswer === 'function') ok('controller exported');
else fail('controller missing');

if (typeof saveStudentAttemptAnswer === 'function') ok('service exported');
else fail('service missing');

const queriesSrc = await fs.readFile(path.join(root, '../src/services/studentAnswerSave.queries.js'), 'utf8');
if (queriesSrc.includes('ON DUPLICATE KEY UPDATE')) ok('UPSERT SQL present');
else fail('UPSERT missing');

if (queriesSrc.includes('TOUCH_ATTEMPT_LAST_ACTIVITY_SQL')) ok('last_activity_at touch query present');
else fail('activity touch missing');

const serviceSrc = await fs.readFile(path.join(root, '../src/services/studentAnswerSave.service.js'), 'utf8');
if (
  serviceSrc.includes('assertAttemptLoadable') &&
  serviceSrc.includes('studentOwnsAttempt') &&
  serviceSrc.includes('QUESTION_BELONGS_TO_TEST_SQL')
) {
  ok('validation flow present');
} else {
  fail('validation flow incomplete');
}

if (!serviceSrc.includes('grade') && !serviceSrc.includes('test_results')) {
  ok('no grading or result writes');
} else {
  fail('unexpected grading/result logic');
}

const gridSrc = await fs.readFile(path.join(root, '../src/security/cee/protectionGrid.js'), 'utf8');
if (gridSrc.includes('/api\\/student') && gridSrc.includes("policy: 'entitlement'")) {
  ok('student namespace entitlement-protected');
} else {
  fail('entitlement grid missing for student routes');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

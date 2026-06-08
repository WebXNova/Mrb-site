/**
 * Static verification for GET /api/student/attempts/:attemptId (Phase 2B).
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

console.log('Student attempt load API verification\n');

const routesSrc = await fs.readFile(path.join(root, '../src/routes/student.routes.js'), 'utf8');
if (routesSrc.includes("router.get('/attempts/:attemptId', getStudentAttempt)")) ok('route registered');
else fail('route missing');

const { getStudentAttempt } = await import('../src/controllers/studentAttempts.controller.js');
const { loadStudentAttemptPage } = await import('../src/services/studentAttemptLoad.service.js');
const { assertStudentOwnsAttempt } = await import('../src/services/attemptOwnership.service.js');

if (typeof getStudentAttempt === 'function') ok('controller exported');
else fail('controller missing');

if (typeof loadStudentAttemptPage === 'function') ok('service exported');
else fail('service missing');

if (typeof assertStudentOwnsAttempt === 'function') ok('assertStudentOwnsAttempt exported');
else fail('assertStudentOwnsAttempt missing');

const serviceSrc = await fs.readFile(path.join(root, '../src/services/studentAttemptLoad.service.js'), 'utf8');
if (serviceSrc.includes('loadComposedTestQuestions') && serviceSrc.includes("audience: 'student'")) {
  ok('uses composed question_bank load path');
} else {
  fail('composed question load missing');
}

if (serviceSrc.includes('LOAD_SAVED_ANSWERS_SQL')) ok('loads saved answers');
else fail('saved answers query missing');

const dtoSrc = await fs.readFile(path.join(root, '../src/dto/studentAttemptLoad.dto.js'), 'utf8');
for (const field of ['attempt', 'questions', 'savedAnswers', 'remainingTimeSeconds', 'question_id', 'option_id']) {
  if (dtoSrc.includes(field)) ok(`response includes ${field}`);
  else fail(`response missing ${field}`);
}

if (dtoSrc.includes('FORBIDDEN_STUDENT_ATTEMPT_LOAD_KEYS')) ok('forbidden leakage keys documented');
else fail('forbidden keys list missing');

const compositionSrc = await fs.readFile(
  path.join(root, '../src/dto/testQuestion.dto.js'),
  'utf8'
);
if (compositionSrc.includes('toTestQuestionOptionStudentDto') && !compositionSrc.match(/toTestQuestionOptionStudentDto[\s\S]*isCorrect/)) {
  ok('student option DTO excludes isCorrect');
} else {
  fail('student option DTO may leak isCorrect');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

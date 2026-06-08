/**
 * P1 PATCH-5 — single publish eligibility engine verification.
 * Run: node scripts/verify-test-publish-gate.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../src/config/mysql.js';
import { AppError } from '../src/errors/base/AppError.js';
import {
  evaluatePublishEligibility,
  validatePublishEligibility,
  normalizePublishEligibilityErrors,
} from '../src/services/testPublishEligibility.service.js';
import { evaluateTestCompleteness, TEST_LIFECYCLE_STATES } from '../src/services/testCompleteness.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) throw new Error(`${label}: missing ${pattern}`);
  console.log(`PASS ${label}`);
}

function assertNoMatch(label, content, pattern) {
  if (pattern.test(content)) throw new Error(`${label}: found ${pattern}`);
  console.log(`PASS ${label}`);
}

const publishEngine = read('src/services/testPublishEligibility.service.js');
const testService = read('src/services/test.service.js');
const lifecycle = read('src/services/testLifecycle.service.js');
const completeness = read('src/services/testCompleteness.service.js');
const composition = read('src/services/testQuestionComposition.service.js');

assertMatch('publish engine exists', publishEngine, /export async function validatePublishEligibility/);
assertMatch('publish engine — evaluate', publishEngine, /export async function evaluatePublishEligibility/);
assertMatch('publish engine — active questions', publishEngine, /countActiveComposedQuestionsForTest/);
assertMatch('publish engine — INVALID_TEST_COMPOSITION normalize', publishEngine, /INVALID_TEST_COMPOSITION/);
assertMatch('publish engine — lifecycle READY', publishEngine, /READY_FOR_PUBLISH/);

assertMatch('publishTest — validate first', testService, /validatePublishEligibility[\s\S]*syncTestLifecycleStatus[\s\S]*executePublishTestStatus/s);
assertNoMatch('test.service — direct published SQL', testService, /SET status = 'published'/);
assertNoMatch('test.service — validateTestCompleteness publish', testService, /validateTestCompleteness/);
assertNoMatch('completeness — publish throw gate', completeness, /cannot be published/);

assertMatch('lifecycle — delegates eligibility', lifecycle, /testPublishEligibility\.service/);
assertMatch('composition — deleted_at filter', composition, /qb\.deleted_at IS NULL/);

// Case — NO_SUBJECTS normalizes to INVALID_TEST_COMPOSITION at publish
const normalized = normalizePublishEligibilityErrors(['NO_SUBJECTS', 'PUBLISH_REQUIREMENTS_NOT_MET']);
if (!normalized.includes('INVALID_TEST_COMPOSITION')) {
  throw new Error('NO_SUBJECTS should normalize to INVALID_TEST_COMPOSITION');
}
console.log('PASS Case — NO_SUBJECTS → INVALID_TEST_COMPOSITION at publish');

// Case 3 — Step 1 incomplete (pure)
const step1 = evaluateTestCompleteness(
  { course_id: null, title: 'ab', test_type: '', category: 'MDCAT', duration_minutes: 10, max_attempts: 1, access_mode: 'private' },
  1,
  'publish',
  []
);
if (step1.step1_complete || step1.can_publish) throw new Error('Case 3: step1 should be incomplete');
console.log('PASS Case 3 — Step 1 incomplete blocks publish');

// Case 4 — Step 2 incomplete
const step2 = evaluateTestCompleteness(
  {
    course_id: 1,
    title: 'Valid Test Title',
    test_type: 'subject_wise',
    category: 'MDCAT',
    duration_minutes: 0,
    max_attempts: 0,
    access_mode: 'private',
  },
  1,
  'publish',
  [1]
);
if (step2.step2_complete) throw new Error('Case 4: step2 should be incomplete');
console.log('PASS Case 4 — Step 2 incomplete blocks publish');

// Case 5 — Step 3 incomplete
const step3 = evaluateTestCompleteness(
  {
    course_id: 1,
    title: 'Valid Test Title',
    test_type: 'subject_wise',
    category: 'MDCAT',
    duration_minutes: 30,
    max_attempts: 2,
    access_mode: '',
  },
  1,
  'publish',
  [1]
);
if (step3.step3_complete) throw new Error('Case 5: step3 should be incomplete');
console.log('PASS Case 5 — Step 3 incomplete blocks publish');

// Case 2 — No active questions (composed count 0)
const step4 = evaluateTestCompleteness(
  {
    course_id: 1,
    title: 'Valid Test Title',
    test_type: 'subject_wise',
    category: 'MDCAT',
    duration_minutes: 30,
    max_attempts: 2,
    access_mode: 'private',
  },
  0,
  'publish',
  [1]
);
if (step4.step4_complete || step4.lifecycle_status === TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH) {
  throw new Error('Case 2: zero active questions should block');
}
console.log('PASS Case 2 — zero active questions blocks READY_FOR_PUBLISH');

let rejected = false;
try {
  await validatePublishEligibility(-999999, mysqlPool, { throwOnFailure: true });
} catch (e) {
  rejected = e instanceof AppError;
}
if (!rejected) throw new Error('missing test publish should fail');
console.log('PASS Case — missing test rejected');

// DB-backed cases when schema available
const [courses] = await mysqlPool.query(`SELECT id FROM courses ORDER BY id ASC LIMIT 1`);
if (!courses[0]) {
  console.log('SKIP DB cases — no course row');
} else {
  const courseId = Number(courses[0].id);
  const [users] = await mysqlPool.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  if (!users[0]) {
    console.log('SKIP DB cases — no user row for created_by');
  } else {
  const createdBy = Number(users[0].id);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [ins] = await connection.query(
      `INSERT INTO tests
         (course_id, title, category, test_type, duration_minutes, max_attempts, access_mode, status, created_by)
       VALUES (?, 'Publish Gate Audit Test', 'MDCAT', 'subject_wise', 30, 2, 'private', 'INCOMPLETE', ?)`,
      [courseId, createdBy]
    );
    const testId = Number(ins.insertId);

    // Case 1 — no subjects
    let report = await evaluatePublishEligibility(testId, connection);
    if (report.valid || !report.errors.includes('INVALID_TEST_COMPOSITION')) {
      throw new Error('Case 1: no subjects must fail INVALID_TEST_COMPOSITION');
    }
    console.log('PASS Case 1 — no subjects (DB)');

    const [subjects] = await connection.query(
      `SELECT id FROM subjects WHERE course_id = ? LIMIT 1`,
      [courseId]
    );
    if (subjects[0]) {
      await connection.query(`INSERT INTO test_subjects (test_id, subject_id) VALUES (?, ?)`, [
        testId,
        Number(subjects[0].id),
      ]);

      // Case 2 — subjects but no questions
      report = await evaluatePublishEligibility(testId, connection);
      if (report.valid || !report.errors.includes('NO_QUESTIONS')) {
        throw new Error('Case 2 DB: no questions must fail NO_QUESTIONS');
      }
      console.log('PASS Case 2 — no questions (DB)');

      const [qb] = await connection.query(
        `SELECT id FROM question_bank WHERE course_id = ? AND deleted_at IS NULL LIMIT 1`,
        [courseId]
      );
      if (qb[0]) {
        await connection.query(`INSERT INTO test_questions (test_id, question_id, display_order) VALUES (?, ?, 1)`, [
          testId,
          Number(qb[0].id),
        ]);

        report = await evaluatePublishEligibility(testId, connection);
        if (!report.valid || report.lifecycle_status !== TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH) {
          throw new Error(`Case 7: expected READY_FOR_PUBLISH, got ${report.lifecycle_status} errors=${report.errors}`);
        }
        console.log('PASS Case 7 — fully valid test eligible (DB)');

        // Case 6 — soft-delete linked question; junction row remains
        await connection.query(`UPDATE question_bank SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`, [
          Number(qb[0].id),
        ]);
        report = await evaluatePublishEligibility(testId, connection);
        if (report.valid || !report.errors.includes('NO_QUESTIONS')) {
          throw new Error('Case 6: deleted-only links must fail NO_QUESTIONS');
        }
        console.log('PASS Case 6 — deleted linked questions only (DB)');
      } else {
        console.log('SKIP Case 6/7 — no question_bank row for course');
      }
    } else {
      console.log('SKIP Case 2/6/7 DB — no subject for course');
    }

    await connection.rollback();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  }
}

console.log('Test publish gate verification complete.');

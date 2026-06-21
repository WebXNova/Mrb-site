/**
 * Regression tests — INSERT_ENTITLED_TEST_ATTEMPT_SQL parameter binding order.
 *
 * Run: npm run test:entitled-attempt-insert
 */
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {
  buildInsertEntitledTestAttemptParams,
  INSERT_ENTITLED_TEST_ATTEMPT_SQL,
} from './testAttempt.queries.js';
import {
  assertEntitledAttemptInsertContext,
  assertStudentIdForAttemptInsert,
} from './testAttempt.service.js';
import {
  assertCanCreateNewTestAttempt,
  evaluateRetakePolicy,
} from './testRetakePolicy.service.js';
import { ApiError } from '../utils/apiError.js';

dotenv.config();

let passed = 0;
let failed = 0;

function ok(message) {
  passed += 1;
  console.log(`  ✓ ${message}`);
}

function fail(message, error = null) {
  failed += 1;
  console.error(`  ✗ ${message}`);
  if (error) console.error(error);
}

function countSqlPlaceholders(sql) {
  return (String(sql).match(/\?/g) ?? []).length;
}

console.log('testAttempt.insertParams — entitled attempt INSERT regression\n');

{
  const placeholderCount = countSqlPlaceholders(INSERT_ENTITLED_TEST_ATTEMPT_SQL);
  if (placeholderCount === 14) {
    ok('INSERT_ENTITLED_TEST_ATTEMPT_SQL has 14 placeholders');
  } else {
    fail(`expected 14 placeholders, got ${placeholderCount}`);
  }
}

{
  const params = buildInsertEntitledTestAttemptParams({
    testId: 14,
    courseId: 37,
    studentId: 23,
    studentName: null,
    attemptNumber: 1,
    durationMinutes: 12,
    ipAddress: null,
    userAgent: null,
    deviceFingerprint: 'fp-test',
    attemptNonce: 'nonce-test-123456789012',
  });

  assert.equal(params.length, 14);
  assert.equal(params[0], 14);
  assert.equal(params[1], 23);
  assert.equal(params[2], 23);
  assert.equal(params[10], 14, '? #11 must bind t.id');
  assert.equal(params[11], 37, '? #12 must bind t.course_id');
  assert.equal(params[12], 23, '? #13 must bind retake student_id');
  assert.equal(params[13], 23, '? #14 must bind retake user_id');
  ok('buildInsertEntitledTestAttemptParams maps WHERE and retake placeholders correctly');
}

{
  const wrongOrder = [
    14, 23, 23, null, 1, 12, null, null, 'fp', 'nonce',
    23, 23, 14, 37,
  ];
  assert.notDeepEqual(
    wrongOrder.slice(10),
    buildInsertEntitledTestAttemptParams({
      testId: 14,
      courseId: 37,
      studentId: 23,
      attemptNumber: 1,
      durationMinutes: 12,
      deviceFingerprint: 'fp',
      attemptNonce: 'nonce',
    }).slice(10),
    'legacy broken tail order must differ from builder'
  );
  ok('legacy broken parameter tail order is detectably different from builder');
}

{
  try {
    assertEntitledAttemptInsertContext({ testId: 0, courseId: 37, studentId: 23 });
    fail('assertEntitledAttemptInsertContext should reject testId <= 0');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'INVALID_TEST_ID') {
      ok('assertEntitledAttemptInsertContext rejects invalid testId');
    } else {
      fail('assertEntitledAttemptInsertContext wrong error for testId', error);
    }
  }
}

{
  try {
    assertEntitledAttemptInsertContext({ testId: 14, courseId: 0, studentId: 23 });
    fail('assertEntitledAttemptInsertContext should reject courseId <= 0');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'INVALID_COURSE_ID') {
      ok('assertEntitledAttemptInsertContext rejects invalid courseId');
    } else {
      fail('assertEntitledAttemptInsertContext wrong error for courseId', error);
    }
  }
}

{
  try {
    assertEntitledAttemptInsertContext({ testId: 14, courseId: 37, studentId: 0 });
    fail('assertEntitledAttemptInsertContext should reject studentId <= 0');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'INVALID_STUDENT_ID') {
      ok('assertEntitledAttemptInsertContext rejects invalid studentId');
    } else {
      fail('assertEntitledAttemptInsertContext wrong error for studentId', error);
    }
  }
}

{
  const ctx = assertEntitledAttemptInsertContext({
    testId: 14,
    courseId: 37,
    studentId: 23,
    slug: '1st-test-14',
  });
  assert.equal(ctx.testId, 14);
  assert.equal(ctx.courseId, 37);
  assert.equal(ctx.studentId, 23);
  ok('assertEntitledAttemptInsertContext accepts valid ids');
}

{
  const first = evaluateRetakePolicy(
    { allow_retake: 0, max_attempts: 1 },
    { totalAttempts: 0, hasActiveAttempt: false }
  );
  assert.equal(first.canCreateNew, true);
  const blocked = evaluateRetakePolicy(
    { allow_retake: 0, max_attempts: 1 },
    { totalAttempts: 1, hasActiveAttempt: false }
  );
  assert.equal(blocked.canCreateNew, false);
  assert.equal(blocked.denyCode, 'RETAKE_NOT_ALLOWED');
  ok('retake policy still blocks second attempt when allow_retake=0');
}

{
  const underMax = evaluateRetakePolicy(
    { allow_retake: 1, max_attempts: 2 },
    { totalAttempts: 1, hasActiveAttempt: false }
  );
  assert.equal(underMax.canCreateNew, true);
  const atMax = evaluateRetakePolicy(
    { allow_retake: 1, max_attempts: 2 },
    { totalAttempts: 2, hasActiveAttempt: false }
  );
  assert.equal(atMax.canCreateNew, false);
  assert.equal(atMax.denyCode, 'MAX_ATTEMPTS_REACHED');
  ok('max_attempts policy still enforced in service layer');
}

{
  assert.doesNotThrow(() =>
    assertCanCreateNewTestAttempt(
      { allow_retake: 1, max_attempts: 2 },
      { totalAttempts: 0, hasActiveAttempt: false },
      { testId: 14 }
    )
  );
  ok('assertCanCreateNewTestAttempt still allows first attempt');
}

if (process.env.MYSQL_HOST && process.env.MYSQL_DATABASE) {
  console.log('\nDB integration (rollback transaction)\n');

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const params = buildInsertEntitledTestAttemptParams({
      testId: 14,
      courseId: 37,
      studentId: 23,
      studentName: null,
      attemptNumber: 99,
      durationMinutes: 12,
      ipAddress: null,
      userAgent: null,
      deviceFingerprint: 'regression-fp',
      attemptNonce: 'regression-nonce-1234567890',
    });

    const [result] = await conn.query(INSERT_ENTITLED_TEST_ATTEMPT_SQL, params);
    const insertId = Number(result?.insertId ?? 0);
    const affectedRows = Number(result?.affectedRows ?? 0);

    if (insertId > 0 && affectedRows > 0) {
      ok(`DB INSERT returns insertId=${insertId} affectedRows=${affectedRows}`);
    } else {
      fail(`DB INSERT expected rows, got insertId=${insertId} affectedRows=${affectedRows}`);
    }

    const brokenParams = [...params];
    brokenParams[10] = 23;
    brokenParams[11] = 23;
    brokenParams[12] = 14;
    brokenParams[13] = 37;
    const [broken] = await conn.query(INSERT_ENTITLED_TEST_ATTEMPT_SQL, brokenParams);
    if (Number(broken?.insertId ?? 0) === 0 && Number(broken?.affectedRows ?? 0) === 0) {
      ok('swapped WHERE params still produce zero rows (regression sentinel)');
    } else {
      fail('swapped WHERE params unexpectedly inserted a row');
    }

    await conn.rollback();
  } catch (error) {
    await conn.rollback();
    fail('DB integration block failed', error);
  } finally {
    conn.release();
    await pool.end();
  }
} else {
  console.log('\n(skipping DB integration — MYSQL_* env not configured)\n');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

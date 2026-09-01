/**
 * Published Test Lock — authority for operations that must stay unpublished-only.
 *
 * Publishing does NOT make the test immutable for authorized admins.
 * In-place admin edits (basic-info, rules, settings, quiz-draft PUT) go through
 * publishedTestEdit.service.js and keep status = published.
 *
 * STILL BLOCKED when status = published:
 *   - DELETE test
 *   - legacy PUT /admin/tests/:id
 *   - DELETE quiz-draft
 *   - question-bank edit/delete for rows linked to a published test
 *
 * ALLOWED for authorized admins while published:
 *   - PATCH basic-info, rules, settings
 *   - PUT quiz-draft (rematerializes runtime questions)
 *   - GET test, rules, settings, completeness, linked questions, quiz-draft
 *   - duplicate, results export, student preview
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import {
  NOT_FOUND,
  QUESTION_MUTATION_NOT_ALLOWED,
  TEST_IS_LOCKED,
} from '../errors/codes/ErrorCodes.js';
import { isPublishedDbStatus } from './testCompleteness.service.js';
import {
  logTestValidationFailure,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadTestLockRow(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT id, status, title
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  return rows[0] ?? null;
}

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {{ reason?: string, action?: string, testId?: number }} [audit]
 */
export function assertTestUnpublished(testRow, audit = {}) {
  if (!testRow) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: audit.testId ?? null },
    });
  }

  if (!isPublishedDbStatus(testRow.status)) {
    return testRow;
  }

  const testId = Number(testRow.id ?? audit.testId);

  logTestValidationFailure({
    testId,
    errorCode: TEST_IS_LOCKED,
    reason: audit.reason ?? 'PUBLISHED_TEST_MUTATION_BLOCKED',
    action: audit.action ?? TEST_SECURITY_ACTIONS.PUBLISHED_TEST_EDIT_ATTEMPT,
  });

  throw new AppError({
    message: 'This action is not allowed on a published test. Duplicate the test or edit it in place from the admin editor.',
    errorCode: TEST_IS_LOCKED,
    httpStatus: 409,
    isOperational: true,
    metadata: { testId, status: testRow.status },
  });
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {{ reason?: string, action?: string }} [audit]
 */
export async function enforceUnpublishedTest(testId, executor = mysqlPool, audit = {}) {
  const row = await loadTestLockRow(testId, executor);
  return assertTestUnpublished(row, { ...audit, testId: Number(testId) });
}

/**
 * Block question bank edits when the question is linked to a published test.
 *
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function enforceQuestionBankMutationAllowed(questionId, executor = mysqlPool) {
  const qid = Number(questionId);
  const [rows] = await executor.query(
    `SELECT t.id AS test_id, t.title AS test_title, t.status
     FROM test_questions tq
     INNER JOIN tests t ON t.id = tq.test_id AND t.deleted_at IS NULL
     WHERE tq.question_id = ?
       AND (
         LOWER(t.status) = 'published'
         OR UPPER(TRIM(t.status)) = 'READY_FOR_PUBLISH'
       )
     ORDER BY t.id ASC
     LIMIT 5`,
    [qid]
  );

  if (!rows.length) {
    return { locked: false, publishedTests: [] };
  }

  logTestValidationFailure({
    testId: Number(rows[0].test_id),
    errorCode: QUESTION_MUTATION_NOT_ALLOWED,
    reason: 'QUESTION_LINKED_TO_PUBLISHED_TEST',
    action: TEST_SECURITY_ACTIONS.QUESTION_LINKING_REJECTION,
    metadata: {
      questionId: qid,
      publishedTestIds: rows.map((row) => Number(row.test_id)),
    },
  });

  throw new AppError({
    message:
      'This question is linked to a published or publish-ready test and cannot be edited or deleted. Duplicate the test to make changes.',
    errorCode: QUESTION_MUTATION_NOT_ALLOWED,
    httpStatus: 409,
    isOperational: true,
    metadata: {
      questionId: qid,
      publishedTests: rows.map((row) => ({
        testId: Number(row.test_id),
        title: String(row.test_title ?? ''),
      })),
    },
  });
}

/**
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function resolveQuestionPublishedLock(questionId, executor = mysqlPool) {
  const qid = Number(questionId);
  const [rows] = await executor.query(
    `SELECT t.id AS test_id, t.title AS test_title
     FROM test_questions tq
     INNER JOIN tests t ON t.id = tq.test_id AND t.deleted_at IS NULL
     WHERE tq.question_id = ?
       AND LOWER(t.status) = 'published'
     ORDER BY t.id ASC
     LIMIT 5`,
    [qid]
  );

  return {
    lockedOnPublishedTest: rows.length > 0,
    publishedTests: rows.map((row) => ({
      testId: Number(row.test_id),
      title: String(row.test_title ?? ''),
    })),
  };
}

/**
 * @param {string|null|undefined} status
 */
export function isTestReadOnlyStatus(status) {
  return isPublishedDbStatus(status);
}

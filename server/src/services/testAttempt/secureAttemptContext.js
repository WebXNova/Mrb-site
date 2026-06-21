/**
 * CEE secure test attempt resolver — service-layer security boundary.
 *
 * Every mutating/read attempt operation must resolve context here before DB access.
 * Does not trust controller validation.
 */

import { assertCourseAccess } from '../entitlement.service.js';
import { scopedQuery } from '../../security/cee/db/scopedQuery.js';
import { emitSecurityAuditEvent } from '../../security/cee/audit/securityAuditLogger.js';
import { CEE_AUDIT_ACTIONS, CEE_AUDIT_VIOLATION_TYPES } from '../../security/cee/audit/auditSchema.js';
import {
  AttemptExpiredError,
  AttemptInvalidStateError,
  AttemptNotFoundError,
  AttemptNotOwnedError,
  AttemptTokenInvalidError,
  CourseScopeViolationError,
  EntitlementRequiredError,
  InvalidOptionError,
  QuestionDeletedError,
  QuestionNotInTestError,
  TestNotAccessibleError,
} from '../../errors/testAttempt/TestAttemptErrors.js';
import { mysqlPool } from '../../config/mysql.js';
import { loadTestSubjectPresentation } from '../testSubjectPresentation.service.js';
import {
  assertTestAvailabilityWindow,
  AVAILABILITY_PHASE,
  getAvailabilityNowMs,
  parseTestAvailabilityInstant,
} from '../testAvailabilityWindow.service.js';

/**
 * @typedef {import('../entitlement.service.js').EntitlementContext} EntitlementContext
 */

/**
 * @typedef {object} SecureAttemptRow
 * @property {number} id
 * @property {number} test_id
 * @property {number} user_id
 * @property {string} status
 * @property {Date|string} started_at
 * @property {Date|string} expires_at
 * @property {Date|string|null} submitted_at
 * @property {string|null} completion_reason
 * @property {string|null} attempt_nonce
 * @property {unknown|null} delivery_layout_json
 * @property {number|null} result_id
 */

/**
 * @typedef {object} SecureTestRow
 * @property {number} id
 * @property {number} course_id
 * @property {string} public_slug
 * @property {string} status
 * @property {string} title
 * @property {string|null} description
 * @property {string|null} subject
 * @property {number} duration_minutes
 * @property {number} show_explanations
 * @property {number} negative_marking
 * @property {number} max_attempts
 * @property {number} passing_marks
 * @property {number} shuffle_questions
 * @property {number} shuffle_options
 * @property {Date|string|null} start_date
 * @property {Date|string|null} end_date
 */

/**
 * @typedef {object} SecureAttemptContext
 * @property {SecureAttemptRow} attempt
 * @property {SecureTestRow} test
 * @property {EntitlementContext} entitlement
 * @property {number} courseId
 * @property {number} userId
 */

/**
 * @typedef {object} ResolveSecureAttemptInput
 * @property {number} attemptId
 * @property {number} userId
 * @property {number} [courseId]
 * @property {string} [slug]
 * @property {EntitlementContext} [entitlement]
 * @property {string} [tokenNonce]
 * @property {boolean} [requireInProgress]
 * @property {boolean} [requireSubmitted]
 * @property {boolean} [forUpdate]
 * @property {import('mysql2/promise').PoolConnection} [connection]
 * @property {string} [auditContext]
 * @property {number} [nowMs] — authoritative UTC ms (from getAvailabilityNowMs)
 */

const ATTEMPT_TEST_SELECT = `
  SELECT a.id,
         a.test_id,
         a.student_id,
         a.user_id,
         a.status,
         a.started_at,
         a.expires_at,
         a.submitted_at,
         a.completion_reason,
         a.attempt_nonce,
         a.delivery_layout_json,
         a.result_id,
         t.id AS t_id,
         t.course_id,
         t.public_slug,
         t.status AS test_status,
         t.title,
         t.description,
         t.duration_minutes,
         t.show_explanations,
         t.negative_marking,
         t.max_attempts,
         t.passing_marks,
         t.shuffle_questions,
         t.shuffle_options,
         t.start_date,
         t.end_date
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id
    AND t.course_id = ?
    AND t.course_id IS NOT NULL
    AND t.status = 'published'
  WHERE a.id = ?
    AND a.user_id = ?`;

/**
 * @param {EntitlementContext} entitlement
 * @param {string} contextLabel
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export function createAttemptScopedQuery(entitlement, contextLabel, executor) {
  return scopedQuery({
    courseId: entitlement.courseId,
    context: contextLabel,
    userId: entitlement.userId,
  }, executor);
}

/**
 * @param {Record<string, unknown>} row
 * @returns {SecureAttemptContext}
 */
function mapRowToSecureContext(row, entitlement, subjectLabel = null) {
  const attempt = {
    id: Number(row.id),
    test_id: Number(row.test_id),
    student_id: Number(row.student_id ?? row.user_id ?? 0),
    user_id: Number(row.user_id),
    status: String(row.status),
    started_at: row.started_at,
    expires_at: row.expires_at,
    submitted_at: row.submitted_at ?? null,
    attempt_nonce: row.attempt_nonce ?? null,
    delivery_layout_json: row.delivery_layout_json ?? null,
    result_id: row.result_id != null ? Number(row.result_id) : null,
  };

  const test = {
    id: Number(row.t_id),
    course_id: Number(row.course_id),
    public_slug: String(row.public_slug || ''),
    status: String(row.test_status),
    title: String(row.title || ''),
    description: row.description ?? null,
    subject: subjectLabel,
    duration_minutes: Number(row.duration_minutes ?? 0),
    show_explanations: Number(row.show_explanations ?? 0),
    negative_marking: Number(row.negative_marking ?? 0),
    max_attempts: Number(row.max_attempts ?? 0),
    passing_marks: Number(row.passing_marks ?? 0),
    shuffle_questions: Number(row.shuffle_questions ?? 0),
    shuffle_options: Number(row.shuffle_options ?? 0),
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
  };

  return Object.freeze({
    attempt,
    test,
    entitlement,
    courseId: entitlement.courseId,
    userId: entitlement.userId,
  });
}

function auditAttemptDenial(reason, input, extra = {}) {
  emitSecurityAuditEvent({
    action: CEE_AUDIT_ACTIONS.ENTITLEMENT_FAILURE,
    violationType: CEE_AUDIT_VIOLATION_TYPES.ENTITLEMENT_FAILURE,
    outcome: 'denied',
    reason,
    context: input.auditContext ?? 'testAttempt.resolveSecureAttemptContext',
    userId: input.userId ?? null,
    courseId: input.courseId ?? null,
    tables: ['test_attempts', 'tests'],
    errorCode: extra.errorCode ?? null,
    skipPersist: false,
  });
}

/**
 * Resolve and validate a test attempt as a security boundary (fail-closed).
 *
 * @param {ResolveSecureAttemptInput} input
 * @returns {Promise<SecureAttemptContext>}
 */
export async function resolveSecureAttemptContext(input) {
  const attemptId = Number(input.attemptId);
  const userId = Number(input.userId);

  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    throw new AttemptNotFoundError({ reason: 'invalid_attempt_id', attemptId: input.attemptId });
  }
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new EntitlementRequiredError({ reason: 'invalid_user_id', userId: input.userId });
  }

  let entitlement = input.entitlement ?? null;
  const courseIdHint = input.courseId != null ? Number(input.courseId) : entitlement?.courseId;

  if (!entitlement) {
    if (!Number.isInteger(courseIdHint) || courseIdHint <= 0) {
      throw new EntitlementRequiredError({
        reason: 'missing_entitlement_and_course_id',
        userId,
        attemptId,
      });
    }
    entitlement = await assertCourseAccess(userId, courseIdHint);
  } else {
    entitlement = await assertCourseAccess(userId, entitlement.courseId);
    if (courseIdHint != null && Number(courseIdHint) !== Number(entitlement.courseId)) {
      auditAttemptDenial('course_id_mismatch', input, { errorCode: 'COURSE_SCOPE_VIOLATION' });
      throw new CourseScopeViolationError({
        userId,
        attemptId,
        requestedCourseId: courseIdHint,
        entitledCourseId: entitlement.courseId,
      });
    }
  }

  const db = createAttemptScopedQuery(
    entitlement,
    input.auditContext ?? 'testAttempt.resolveSecureAttemptContext',
    input.connection
  );

  let sql = ATTEMPT_TEST_SELECT;
  if (input.forUpdate) {
    sql = `${sql} FOR UPDATE`;
  }

  const rows = await db.rows(sql, [entitlement.courseId, attemptId, userId]);
  const row = rows[0];

  if (!row) {
    auditAttemptDenial('attempt_not_found_or_out_of_scope', input, { errorCode: 'ATTEMPT_NOT_FOUND' });
    throw new AttemptNotFoundError({
      attemptId,
      userId,
      courseId: entitlement.courseId,
      slug: input.slug ?? null,
    });
  }

  if (Number(row.user_id) !== userId) {
    auditAttemptDenial('attempt_user_mismatch', input, { errorCode: 'ATTEMPT_NOT_OWNED' });
    throw new AttemptNotOwnedError({ attemptId, userId, ownerId: row.user_id });
  }

  if (Number(row.course_id) !== entitlement.courseId) {
    auditAttemptDenial('test_course_mismatch', input, { errorCode: 'COURSE_SCOPE_VIOLATION' });
    throw new CourseScopeViolationError({
      attemptId,
      testCourseId: row.course_id,
      entitledCourseId: entitlement.courseId,
    });
  }

  if (row.course_id == null) {
    throw new TestNotAccessibleError({ attemptId, reason: 'orphan_test' });
  }

  const normalizedSlug = input.slug != null ? String(input.slug).trim() : null;
  if (normalizedSlug && String(row.public_slug) !== normalizedSlug) {
    auditAttemptDenial('slug_mismatch', input, { errorCode: 'COURSE_SCOPE_VIOLATION' });
    throw new CourseScopeViolationError({
      attemptId,
      expectedSlug: normalizedSlug,
      actualSlug: row.public_slug,
    });
  }

  if (input.tokenNonce != null) {
    const expected = String(input.tokenNonce);
    if (!expected || String(row.attempt_nonce) !== expected) {
      auditAttemptDenial('attempt_token_nonce_mismatch', input, {
        errorCode: 'ATTEMPT_TOKEN_INVALID',
      });
      throw new AttemptTokenInvalidError({
        attemptId,
        userId,
        reason: 'nonce_mismatch',
      });
    }
  }

  const subjectPresentation = await loadTestSubjectPresentation(Number(row.t_id));
  const ctx = mapRowToSecureContext(row, entitlement, subjectPresentation.displayLabel);

  const executor = input.connection ?? mysqlPool;
  const nowMs =
    input.nowMs != null && Number.isFinite(input.nowMs)
      ? input.nowMs
      : await getAvailabilityNowMs(executor);

  if (input.requireInProgress) {
    if (ctx.attempt.status !== 'in_progress') {
      throw new AttemptInvalidStateError({
        attemptId,
        status: ctx.attempt.status,
        required: 'in_progress',
      });
    }
    const expiresMs = parseTestAvailabilityInstant(ctx.attempt.expires_at);
    if (expiresMs != null && nowMs > expiresMs) {
      throw new AttemptExpiredError({ attemptId, expiresAt: ctx.attempt.expires_at });
    }
  }

  if (input.requireSubmitted) {
    if (ctx.attempt.status !== 'submitted') {
      throw new AttemptInvalidStateError({
        attemptId,
        status: ctx.attempt.status,
        required: 'submitted',
      });
    }
  } else if (input.requireInProgress || input.enforceAvailabilityWindow !== false) {
    assertTestAvailabilityWindow(
      {
        id: ctx.test.id,
        start_date: row.start_date,
        end_date: row.end_date,
      },
      {
        phase: AVAILABILITY_PHASE.IN_PROGRESS,
        nowMs,
        attemptStartedAt: ctx.attempt.started_at,
        context: input.auditContext ?? 'testAttempt.resolveSecureAttemptContext',
      }
    );
  }

  return ctx;
}

/**
 * Validate question_bank.id is linked to attempt's test (defense in depth).
 * @param {SecureAttemptContext} ctx
 * @param {number} questionId question_bank.id
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function assertQuestionBelongsToAttempt(ctx, questionId, executor) {
  const qid = Number(questionId);
  if (!Number.isInteger(qid) || qid <= 0) {
    throw new AttemptInvalidStateError({ reason: 'invalid_question_id', questionId });
  }

  const db = createAttemptScopedQuery(ctx.entitlement, 'testAttempt.assertQuestionBelongsToAttempt', executor);
  const rows = await db.rows(
    `SELECT tq.question_id
     FROM test_questions tq
     INNER JOIN tests t ON t.id = tq.test_id AND t.course_id = ?
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ? AND tq.question_id = ?
     LIMIT 1`,
    [ctx.courseId, ctx.attempt.test_id, qid]
  );

  if (rows[0]) {
    return;
  }

  const deletedRows = await db.rows(
    `SELECT tq.question_id
     FROM test_questions tq
     INNER JOIN tests t ON t.id = tq.test_id AND t.course_id = ?
     LEFT JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ? AND tq.question_id = ? AND qb.id IS NULL
     LIMIT 1`,
    [ctx.courseId, ctx.attempt.test_id, qid]
  );

  if (deletedRows[0]) {
    throw new QuestionDeletedError({
      attemptId: ctx.attempt.id,
      questionId: qid,
      testId: ctx.attempt.test_id,
    });
  }

  throw new QuestionNotInTestError({
    attemptId: ctx.attempt.id,
    questionId: qid,
    testId: ctx.attempt.test_id,
  });
}

/**
 * Validate question_options.id belongs to question_bank.id.
 * @param {number} questionId
 * @param {number} optionId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function assertOptionBelongsToQuestion(questionId, optionId, executor = mysqlPool) {
  const qid = Number(questionId);
  const oid = Number(optionId);
  if (!Number.isInteger(qid) || qid <= 0 || !Number.isInteger(oid) || oid <= 0) {
    throw new InvalidOptionError({ questionId, optionId, reason: 'invalid_ids' });
  }

  const [rows] = await executor.query(
    `SELECT id
     FROM question_options
     WHERE id = ? AND question_id = ?
     LIMIT 1`,
    [oid, qid]
  );

  if (!rows[0]) {
    throw new InvalidOptionError({ questionId: qid, optionId: oid });
  }
}

/**
 * Attempt session core — fetch, validate, and expiry enforcement only.
 *
 * No creation, grading, answers, or submission logic.
 */

import {
  AttemptExpiredStateError,
  AttemptInvalidStateError,
  AttemptNotFoundError,
  AttemptNotOwnedError,
} from '../errors/testAttempt/TestAttemptErrors.js';
import { StructuredLogger } from '../utils/requestId.js';
import { ATTEMPT_DB_STATUS } from './attempt.constants.js';
import {
  CHECK_ATTEMPT_EXPIRED_SQL,
  EXPIRE_ATTEMPT_IF_PAST_DEADLINE_SQL,
  GET_ACTIVE_ATTEMPT_SQL,
  GET_ATTEMPT_BY_ID_SQL,
} from './attempt.queries.js';
import { assertAttemptTokenMatches, parsePositiveInt, studentOwnsAttemptRow } from './attempt.util.js';

const logger = new StructuredLogger({ service: 'attemptCore' });

/**
 * @typedef {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} DbExecutor
 */

/**
 * @param {DbExecutor} db
 * @param {number|string} studentId
 * @param {number|string} testId
 */
export async function getActiveAttempt(db, studentId, testId) {
  const sid = parsePositiveInt(studentId);
  const tid = parsePositiveInt(testId);
  if (sid == null || tid == null) {
    throw new AttemptNotFoundError({ reason: 'invalid_student_or_test_id' });
  }

  const [rows] = await db.query(GET_ACTIVE_ATTEMPT_SQL, [tid, sid]);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return enforceExpiry(row, db);
}

/**
 * Validates attempt ownership, active status, token binding, and expiry.
 *
 * @param {DbExecutor} db
 * @param {number|string} attemptId
 * @param {number|string} studentId
 * @param {{ attemptToken?: string|null, requireToken?: boolean }} [options]
 */
export async function validateAttemptAccess(db, attemptId, studentId, options = {}) {
  const aid = parsePositiveInt(attemptId);
  const sid = parsePositiveInt(studentId);
  if (aid == null || sid == null) {
    throw new AttemptNotFoundError({ reason: 'invalid_attempt_or_student_id' });
  }

  const [rows] = await db.query(GET_ATTEMPT_BY_ID_SQL, [aid]);
  const row = rows[0];
  if (!row) {
    throw new AttemptNotFoundError({ attemptId: aid, reason: 'attempt_not_found' });
  }

  if (!studentOwnsAttemptRow(row, sid)) {
    logger.warn('attempt access denied — ownership mismatch', {
      attemptId: aid,
      studentId: sid,
      event: 'ATTEMPT_ACCESS_DENIED',
    });
    throw new AttemptNotOwnedError({ attemptId: aid, studentId: sid });
  }

  const requireToken = options.requireToken !== false;
  if (requireToken) {
    assertAttemptTokenMatches(row.attempt_nonce, options.attemptToken ?? null);
  }

  if (String(row.status) !== ATTEMPT_DB_STATUS.ACTIVE) {
    if (String(row.status) === ATTEMPT_DB_STATUS.EXPIRED) {
      throw new AttemptExpiredStateError({ attemptId: aid });
    }
    throw new AttemptInvalidStateError({
      attemptId: aid,
      status: row.status,
      reason: 'attempt_not_active',
    });
  }

  return enforceExpiry(row, db);
}

/**
 * Strict server-side expiry enforcement using expires_at + MySQL NOW().
 * Marks attempt expired and blocks access immediately when past deadline.
 *
 * @param {Record<string, unknown>} attempt
 * @param {DbExecutor} [db]
 */
export async function enforceExpiry(attempt, db) {
  const attemptId = parsePositiveInt(attempt?.id);
  if (attemptId == null) {
    throw new AttemptNotFoundError({ reason: 'invalid_attempt_row' });
  }

  if (attempt.expires_at == null) {
    logger.error('attempt missing expires_at — blocking access', { attemptId });
    throw new AttemptInvalidStateError({ attemptId, reason: 'missing_expires_at' });
  }

  await db.query(EXPIRE_ATTEMPT_IF_PAST_DEADLINE_SQL, [attemptId]);

  const [rows] = await db.query(CHECK_ATTEMPT_EXPIRED_SQL, [attemptId]);
  const fresh = rows[0];
  if (!fresh) {
    throw new AttemptNotFoundError({ attemptId, reason: 'attempt_not_found_after_expiry_check' });
  }

  const isPastExpiry = Number(fresh.is_past_expiry) === 1;
  const status = String(fresh.status);

  if (isPastExpiry || status === ATTEMPT_DB_STATUS.EXPIRED) {
    if (status === ATTEMPT_DB_STATUS.ACTIVE && isPastExpiry) {
      await db.query(EXPIRE_ATTEMPT_IF_PAST_DEADLINE_SQL, [attemptId]);
    }
    logger.info('attempt blocked — expired', { attemptId, event: 'ATTEMPT_EXPIRED_BLOCKED' });
    throw new AttemptExpiredStateError({ attemptId });
  }

  if (status !== ATTEMPT_DB_STATUS.ACTIVE) {
    throw new AttemptInvalidStateError({ attemptId, status, reason: 'attempt_not_active' });
  }

  return fresh;
}

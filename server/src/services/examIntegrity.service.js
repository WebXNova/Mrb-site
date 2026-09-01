/**
 * Per-test exam integrity (focus loss). Blocks that test for that student only.
 * Does not ban accounts, other tests, or course enrollment.
 */

import { mysqlPool } from '../config/mysql.js';
import { getRedisClient } from '../config/redis.js';
import { resolveSecureAttemptContext } from './testAttempt/secureAttemptContext.js';
import {
  EXAM_INTEGRITY_MAX_STRIKES,
  incrementExamIntegrityStrike,
} from './examIntegrity.store.js';

const guestStrikeMemory = new Map();

async function incrementGuestAttemptStrike(attemptId) {
  const id = Number(attemptId);
  if (!Number.isInteger(id) || id <= 0) {
    return { strikeCount: 0, blocked: false };
  }
  const redis = getRedisClient();
  if (redis) {
    const key = `exam-integrity:guest-attempt:${id}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 8 * 60 * 60);
    }
    const strikeCount = Math.min(EXAM_INTEGRITY_MAX_STRIKES, Number(count) || 0);
    return { strikeCount, blocked: strikeCount >= EXAM_INTEGRITY_MAX_STRIKES };
  }
  const next = Math.min(EXAM_INTEGRITY_MAX_STRIKES, (guestStrikeMemory.get(id) || 0) + 1);
  guestStrikeMemory.set(id, next);
  return { strikeCount: next, blocked: next >= EXAM_INTEGRITY_MAX_STRIKES };
}

export { EXAM_INTEGRITY_MAX_STRIKES, assertNotBlockedByExamIntegrity, loadExamIntegrityBlock } from './examIntegrity.store.js';

/**
 * Record one focus-loss strike against this in-progress attempt / test.
 *
 * @param {{
 *   attemptId: number,
 *   userId: number,
 *   slug?: string,
 *   courseId?: number|null,
 *   entitlement?: object,
 *   tokenNonce?: string,
 * }} input
 */
export async function recordExamIntegrityStrike(input) {
  const ctx = await resolveSecureAttemptContext({
    attemptId: input.attemptId,
    userId: input.userId,
    slug: input.slug,
    courseId: input.courseId,
    entitlement: input.entitlement,
    tokenNonce: input.tokenNonce,
    requireInProgress: true,
    auditContext: 'examIntegrity.recordExamIntegrityStrike',
  });

  const testId = Number(ctx.attempt.test_id);
  const userId = Number(ctx.userId);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await incrementExamIntegrityStrike({ testId, userId, connection });
    await connection.commit();
    return {
      strikeCount: result.strikeCount,
      blocked: result.blocked,
      shouldSubmit: result.blocked,
      maxStrikes: EXAM_INTEGRITY_MAX_STRIKES,
      attemptId: Number(ctx.attempt.id),
      testId,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Guest Free Session focus-loss strikes. Not stored on test_integrity_blocks
 * (that table is account-scoped). Third strike auto-submits this attempt only.
 */
export async function recordGuestExamIntegrityStrike(input) {
  const ctx = await resolveSecureAttemptContext({
    attemptId: input.attemptId,
    userId: 0,
    slug: input.slug,
    tokenNonce: input.tokenNonce,
    guestSessionHash: input.guestSessionHash,
    requireInProgress: true,
    auditContext: 'examIntegrity.recordGuestExamIntegrityStrike',
  });

  const result = await incrementGuestAttemptStrike(Number(ctx.attempt.id));
  return {
    strikeCount: result.strikeCount,
    blocked: result.blocked,
    shouldSubmit: result.blocked,
    maxStrikes: EXAM_INTEGRITY_MAX_STRIKES,
    attemptId: Number(ctx.attempt.id),
    testId: Number(ctx.attempt.test_id),
  };
}

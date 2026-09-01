/**
 * Persistence for per-test exam-integrity blocks. No attempt-context imports
 * (keeps access services free of circular dependencies).
 */

import { mysqlPool } from '../config/mysql.js';
import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';

export const EXAM_INTEGRITY_MAX_STRIKES = 3;

/**
 * @param {{ testId: number, userId: number, executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }}
 */
export async function loadExamIntegrityBlock({ testId, userId, executor = mysqlPool }) {
  const tid = Number(testId);
  const uid = Number(userId);
  if (!Number.isInteger(tid) || tid <= 0 || !Number.isInteger(uid) || uid <= 0) {
    return null;
  }
  const [rows] = await executor.query(
    `SELECT test_id, user_id, strike_count, blocked_at
     FROM test_integrity_blocks
     WHERE test_id = ? AND user_id = ?
     LIMIT 1`,
    [tid, uid]
  );
  return rows[0] ?? null;
}

/**
 * @param {{ testId: number, userId: number, executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }}
 */
export async function assertNotBlockedByExamIntegrity({ testId, userId, executor = mysqlPool }) {
  const row = await loadExamIntegrityBlock({ testId, userId, executor });
  if (row?.blocked_at) {
    throw new TestNotAccessibleError({
      testId,
      userId,
      reason: 'exam_integrity_blocked',
    });
  }
}

/**
 * @param {{ testId: number, userId: number, connection: import('mysql2/promise').PoolConnection }}
 */
export async function incrementExamIntegrityStrike({ testId, userId, connection }) {
  await connection.query(
    `INSERT INTO test_integrity_blocks (test_id, user_id, strike_count, blocked_at)
     VALUES (?, ?, 1, NULL)
     ON DUPLICATE KEY UPDATE
       strike_count = LEAST(?, strike_count + 1),
       blocked_at = IF(strike_count >= ?, COALESCE(blocked_at, UTC_TIMESTAMP()), blocked_at)`,
    [testId, userId, EXAM_INTEGRITY_MAX_STRIKES, EXAM_INTEGRITY_MAX_STRIKES]
  );
  const [rows] = await connection.query(
    `SELECT strike_count, blocked_at
     FROM test_integrity_blocks
     WHERE test_id = ? AND user_id = ?
     LIMIT 1
     FOR UPDATE`,
    [testId, userId]
  );
  return {
    strikeCount: Number(rows[0]?.strike_count ?? 0),
    blocked: Boolean(rows[0]?.blocked_at),
  };
}

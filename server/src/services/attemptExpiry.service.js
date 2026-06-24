import { mysqlPool } from '../config/mysql.js';
import { StructuredLogger } from '../utils/requestId.js';
import { EXPIRE_ATTEMPT_IF_EXPIRED_SQL } from './attemptTimer.queries.js';

const logger = new StructuredLogger({ service: 'attemptExpiry' });

/**
 * Mark attempt as expired if server time is past expires_at.
 *
 * @param {object} input
 * @param {number} input.attemptId
 * @param {number} input.nowMs
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [input.executor]
 * @returns {Promise<boolean>} true when status flipped to expired
 */
export async function expireAttemptIfExpired({ attemptId, nowMs, executor = mysqlPool }) {
  const aid = Number(attemptId);
  if (!Number.isInteger(aid) || aid <= 0) return false;

  const [result] = await executor.query(EXPIRE_ATTEMPT_IF_EXPIRED_SQL, [aid]);
  const affected = Number(result?.affectedRows ?? 0);

  if (affected > 0) {
    logger.warn('attempt auto-expired', { attemptId: aid });
    return true;
  }

  return false;
}


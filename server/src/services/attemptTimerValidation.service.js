/**
 * Server controlled attempt timer validation + expiry handling.
 */

import { mysqlPool } from '../config/mysql.js';
import { StructuredLogger } from '../utils/requestId.js';
import { LOAD_ATTEMPT_TIMER_SQL } from './attemptTimer.queries.js';
import { expireAttemptIfExpired } from './attemptExpiry.service.js';
import { parseMySqlDateTimeToMs } from './attemptTiming.service.js';
import { getAvailabilityNowMs } from './testAvailabilityWindow.service.js';
import {
  AttemptExpiredStateError,
  AttemptInvalidStateError,
  AttemptNotFoundError,
} from '../errors/testAttempt/TestAttemptErrors.js';

const logger = new StructuredLogger({ service: 'attemptTimerValidation' });

/**
 * Validate attempt timer using server clock.
 *
 * @param {number|string} attemptId
 * @param {object} [options]
 * @param {number} [options.nowMs] — override Date.now() for tests
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [options.executor]
 * @param {{ status?: string, expires_at?: unknown } | null} [options.attemptRow] — optional preloaded row
 * @param {boolean} [options.markExpired] — when true, flips status/completion_reason
 * @returns {Promise<void>}
 */
export async function validateAttemptTimer(attemptId, options = {}) {
  const aid = Number(attemptId);
  const executor = options.executor ?? mysqlPool;
  const markExpired = options.markExpired !== false;
  const nowMs =
    options.nowMs != null && Number.isFinite(options.nowMs)
      ? options.nowMs
      : await getAvailabilityNowMs(executor);

  if (!Number.isInteger(aid) || aid <= 0) {
    throw new AttemptNotFoundError({ reason: 'invalid_attempt_id', attemptId });
  }

  let row = options.attemptRow ?? null;
  if (!row) {
    const [[dbRow]] = await executor.query(LOAD_ATTEMPT_TIMER_SQL, [aid]);
    row = dbRow ?? null;
  }

  if (!row) {
    throw new AttemptNotFoundError({ attemptId: aid, reason: 'attempt_not_found' });
  }

  const status = String(row.status ?? '');
  if (status === 'expired') {
    throw new AttemptExpiredStateError({
      attemptId: aid,
      expiresAt: row.expires_at ?? null,
    });
  }

  if (status !== 'in_progress') {
    throw new AttemptInvalidStateError({
      attemptId: aid,
      status,
      required: 'in_progress',
    });
  }

  const expiresAtRaw = row.expires_at ?? null;
  if (expiresAtRaw == null || expiresAtRaw === '') {
    // No expiry configured — treat as not expired.
    return;
  }

  const expiresMs = parseMySqlDateTimeToMs(expiresAtRaw);
  if (Number.isNaN(expiresMs)) {
    // Corrupted expiry — fail-closed by denying access.
    throw new AttemptInvalidStateError({
      attemptId: aid,
      status: 'in_progress',
      reason: 'invalid_expires_at',
    });
  }

  if (nowMs > expiresMs) {
    if (markExpired) {
      await expireAttemptIfExpired({ attemptId: aid, nowMs, executor });
    }

    logger.info('attempt rejected — expired', {
      attemptId: aid,
      nowMs,
      expiresAt: expiresAtRaw,
    });

    throw new AttemptExpiredStateError({
      attemptId: aid,
      expiresAt: expiresAtRaw,
      reason: 'timer_expired',
    });
  }
}


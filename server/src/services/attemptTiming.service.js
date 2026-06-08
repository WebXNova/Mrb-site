/**
 * Attempt timer timing — single MySQL clock for started_at / expires_at.
 *
 * All attempt inserts use CURRENT_TIMESTAMP + DATE_ADD so started_at and
 * expires_at share the same timezone basis (MySQL session time).
 */

import { ApiError } from '../utils/apiError.js';

/**
 * @param {unknown} durationMinutes
 * @param {{ testId?: number, context?: string }} [meta]
 * @returns {number}
 */
export function assertValidTestDurationMinutes(durationMinutes, meta = {}) {
  const value = Number(durationMinutes);

  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new ApiError(422, 'Invalid test duration', {
      code: 'INVALID_TEST_DURATION',
      durationMinutes,
      ...meta,
    });
  }

  return value;
}

/**
 * Parse MySQL DATETIME (naive local wall-clock) or Date to epoch ms.
 * @param {unknown} value
 * @returns {number}
 */
export function parseMySqlDateTimeToMs(value) {
  if (value == null || value === '') {
    return NaN;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const raw = String(value).trim();
  if (!raw) {
    return NaN;
  }

  const mysqlLocalMatch = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
  );
  if (mysqlLocalMatch) {
    const [, y, mo, d, hh, mm, ss] = mysqlLocalMatch.map(Number);
    return new Date(y, mo - 1, d, hh, mm, ss).getTime();
  }

  return new Date(raw).getTime();
}

/**
 * @param {import('../utils/requestId.js').StructuredLogger} logger
 * @param {object} payload
 */
export function logAttemptTimeCalculation(logger, payload) {
  logger.info('attempt time calculation', {
    event: 'ATTEMPT_TIME_CALCULATION',
    strategy: 'mysql_current_timestamp_plus_interval',
    ...payload,
  });
}

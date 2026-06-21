/**
 * Attempt timer timing — UTC MySQL clock for started_at / expires_at.
 *
 * Attempt inserts use UTC_TIMESTAMP(); parsing and expiry SQL use the same UTC basis.
 */

import { ApiError } from '../utils/apiError.js';
import { parseTestAvailabilityInstant } from './testAvailabilityWindow.service.js';

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
 * Parse MySQL DATETIME / ISO to epoch ms (UTC semantics — G-RT-03).
 * @param {unknown} value
 * @returns {number}
 */
export function parseMySqlDateTimeToMs(value) {
  const ms = parseTestAvailabilityInstant(value);
  return ms == null ? NaN : ms;
}

/**
 * Compute elapsed seconds from attempt start to authoritative UTC now.
 * Matches UTC_TIMESTAMP() storage — do not use `new Date(mysqlDatetime)` (local TZ drift).
 *
 * @param {unknown} startedAt — MySQL DATETIME string (UTC semantics)
 * @param {number} nowMs — authoritative UTC ms (prefer getAvailabilityNowMs)
 * @returns {number}
 */
export function computeAttemptTimeTakenSeconds(startedAt, nowMs) {
  const startedMs = parseMySqlDateTimeToMs(startedAt);
  const now = Number(nowMs);
  if (!Number.isFinite(startedMs) || !Number.isFinite(now)) {
    return 0;
  }
  return Math.max(0, Math.floor((now - startedMs) / 1000));
}

/**
 * Resolve display time taken — trust persisted `time_taken_seconds` when present.
 * Timestamp derivation is fallback only (started_at is UTC; submitted_at may be legacy local).
 *
 * @param {{
 *   startedAt?: unknown,
 *   submittedAt?: unknown,
 *   storedSeconds?: unknown,
 * }} input
 * @returns {number}
 */
export function resolveAttemptTimeTakenSeconds({ startedAt, submittedAt, storedSeconds }) {
  if (storedSeconds != null && storedSeconds !== '') {
    const stored = Number(storedSeconds);
    if (Number.isFinite(stored) && stored >= 0) {
      return stored;
    }
  }

  if (startedAt != null && submittedAt != null) {
    const startedMs = parseMySqlDateTimeToMs(startedAt);
    const submittedMs = parseMySqlDateTimeToMs(submittedAt);
    if (Number.isFinite(startedMs) && Number.isFinite(submittedMs)) {
      return Math.max(0, Math.floor((submittedMs - startedMs) / 1000));
    }
  }

  return 0;
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

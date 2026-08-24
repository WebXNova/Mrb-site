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

/** Client timer + network/clock slack after expires_at for submit only. */
export const SUBMIT_GRACE_MS = 15_000;

const ATTEMPT_JWT_BUFFER_MS = 120_000;
const ATTEMPT_JWT_MIN_MS = 120_000;
const ATTEMPT_JWT_UNLIMITED_MS = 8 * 60 * 60 * 1000;
const ATTEMPT_JWT_HARD_CAP_MS = 12 * 60 * 60 * 1000;

/**
 * True when submit is still allowed (expires_at + grace).
 * @param {number} nowMs
 * @param {number|null|undefined} expiresAtMs
 */
export function isWithinSubmitGraceWindow(nowMs, expiresAtMs) {
  if (expiresAtMs == null || !Number.isFinite(expiresAtMs)) return true;
  return Number(nowMs) <= expiresAtMs + SUBMIT_GRACE_MS;
}

/**
 * JWT envelope in seconds: remaining attempt time + buffer, 8h when unlimited/unknown.
 * Finite durations may exceed 8h up to a 12h safety cap (schema max is 600 minutes).
 *
 * @param {{ expiresAt?: unknown, durationMinutes?: unknown, nowMs?: number }} input
 * @returns {number}
 */
export function resolveAttemptJwtExpiresInSeconds({ expiresAt, durationMinutes, nowMs = Date.now() } = {}) {
  const expiresMs = parseTestAvailabilityInstant(expiresAt);
  let ttlMs;

  if (expiresMs != null) {
    ttlMs = expiresMs - nowMs + ATTEMPT_JWT_BUFFER_MS;
  } else {
    const minutes = Number(durationMinutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      ttlMs = minutes * 60_000 + ATTEMPT_JWT_BUFFER_MS;
    } else {
      ttlMs = ATTEMPT_JWT_UNLIMITED_MS;
    }
  }

  ttlMs = Math.max(ATTEMPT_JWT_MIN_MS, Math.min(ATTEMPT_JWT_HARD_CAP_MS, ttlMs));
  return Math.ceil(ttlMs / 1000);
}

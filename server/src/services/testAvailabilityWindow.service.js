/**
 * G-RT-03 — Authoritative test availability window (start_date / end_date).
 *
 * All student runtime paths MUST use this module.
 * - Authoritative "now": MySQL UTC_TIMESTAMP via fetchUtcNowMs / getAvailabilityNowMs.
 * - Stored/wire datetimes without timezone are interpreted as UTC.
 */

import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';
import { StructuredLogger } from '../utils/requestId.js';

const availabilityClockLogger = new StructuredLogger({ service: 'testAvailabilityWindow' });

/** @typedef {'any_access' | 'create_attempt' | 'in_progress'} AvailabilityPhase */

export const AVAILABILITY_PHASE = Object.freeze({
  ANY_ACCESS: 'any_access',
  CREATE_ATTEMPT: 'create_attempt',
  IN_PROGRESS: 'in_progress',
});

/**
 * Parse admin-configured availability instant to UTC epoch ms.
 * MySQL DATETIME strings are treated as UTC (no local TZ drift).
 *
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseTestAvailabilityInstant(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }

  const str = String(value).trim();
  if (!str) return null;

  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(str)) {
    const ms = Date.parse(str);
    return Number.isNaN(ms) ? null : ms;
  }

  const normalized = str.includes('T') ? str : str.replace(' ', 'T');
  const isoUtc = normalized.endsWith('Z') ? normalized : `${normalized}Z`;
  const ms = Date.parse(isoUtc);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Format a parsed availability instant (epoch ms) for error/UI metadata.
 * Uses the same ms values that drive access-control comparisons.
 *
 * @param {number|null|undefined} ms
 * @returns {string|null}
 */
export function formatAvailabilityMetadataIso(ms) {
  return ms == null ? null : new Date(ms).toISOString();
}

/**
 * @param {unknown} value — raw DB/admin value or parsed epoch ms
 * @returns {string|null}
 */
export function toAvailabilityIso(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  const ms = parseTestAvailabilityInstant(value);
  return ms == null ? null : new Date(ms).toISOString();
}

/**
 * Non-throwing availability snapshot for prep/listing UI.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {number} [nowMs]
 */
export function evaluateTestAvailabilityWindow(testRow, nowMs) {
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('evaluateTestAvailabilityWindow requires a finite nowMs from getAvailabilityNowMs');
  }
  const testId = testRow?.id ?? testRow?.test_id ?? null;
  const startMs = parseTestAvailabilityInstant(testRow?.start_date);
  const endMs = parseTestAvailabilityInstant(testRow?.end_date);

  const notYetAvailable = startMs != null && nowMs < startMs;
  const pastEnd = endMs != null && nowMs > endMs;

  return {
    testId,
    notYetAvailable,
    noLongerAvailable: pastEnd,
    canAccess: !notYetAvailable,
    canCreateAttempt: !notYetAvailable && !pastEnd,
    canResumeInProgress: !notYetAvailable,
    startDate: formatAvailabilityMetadataIso(startMs),
    endDate: formatAvailabilityMetadataIso(endMs),
  };
}

/**
 * Fail-closed availability enforcement.
 *
 * Rules:
 * - ANY_ACCESS: block before start_date
 * - CREATE_ATTEMPT: block before start or after end_date (no new attempts)
 * - IN_PROGRESS: block before start; after end allow only attempts started on/before end_date
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {{
 *   phase: AvailabilityPhase,
 *   nowMs?: number,
 *   attemptStartedAt?: unknown,
 *   context?: string,
 * }} options
 */
export function assertTestAvailabilityWindow(testRow, options) {
  const phase = options.phase;
  const nowMs = options.nowMs;
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('assertTestAvailabilityWindow requires options.nowMs from getAvailabilityNowMs');
  }
  const testId = testRow?.id ?? testRow?.test_id ?? null;
  const startMs = parseTestAvailabilityInstant(testRow?.start_date);
  const endMs = parseTestAvailabilityInstant(testRow?.end_date);

  if (startMs != null && nowMs < startMs) {
    throw new TestNotAccessibleError({
      testId,
      reason: 'test_not_yet_available',
      startDate: formatAvailabilityMetadataIso(startMs),
      phase,
      context: options.context ?? null,
    });
  }

  if (phase === AVAILABILITY_PHASE.CREATE_ATTEMPT && endMs != null && nowMs > endMs) {
    throw new TestNotAccessibleError({
      testId,
      reason: 'test_no_longer_available',
      endDate: formatAvailabilityMetadataIso(endMs),
      phase,
      context: options.context ?? null,
    });
  }

  if (phase === AVAILABILITY_PHASE.IN_PROGRESS && endMs != null && nowMs > endMs) {
    const attemptStartMs = parseTestAvailabilityInstant(options.attemptStartedAt);
    if (attemptStartMs == null || attemptStartMs > endMs) {
      throw new TestNotAccessibleError({
        testId,
        reason: 'test_no_longer_available',
        endDate: formatAvailabilityMetadataIso(endMs),
        phase,
        context: options.context ?? null,
        attemptStartedAt: formatAvailabilityMetadataIso(attemptStartMs),
      });
    }
  }
}

/**
 * Load authoritative UTC now from MySQL (race-safe inside transactions).
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @returns {Promise<number>}
 */
export async function fetchUtcNowMs(executor) {
  return getAvailabilityNowMs(executor);
}

/**
 * Authoritative UTC clock for availability enforcement (MySQL UTC_TIMESTAMP).
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @returns {Promise<number>}
 */
export async function getAvailabilityNowMs(executor) {
  const [[row]] = await executor.query('SELECT UTC_TIMESTAMP(3) AS now_utc');
  const ms = parseTestAvailabilityInstant(row?.now_utc);
  if (ms == null) {
    availabilityClockLogger.warn('availability clock fallback to Node Date.now()', {
      event: 'AVAILABILITY_CLOCK_FALLBACK',
      reason: 'utc_timestamp_unparseable',
    });
    return Date.now();
  }
  return ms;
}

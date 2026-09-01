/**
 * G-RT-04 — Authoritative test retake policy (`max_attempts` from Rules).
 *
 * Terminal attempt statuses consume the student's attempt slot.
 * The deprecated `allow_retake` column is no longer read — use max attempts in Setup → Rules.
 */

import { ApiError } from '../utils/apiError.js';

/** DB statuses that end an attempt session (not resumable as "new"). */
export const TERMINAL_ATTEMPT_STATUSES = Object.freeze(['submitted', 'expired']);

/**
 * @typedef {object} AttemptAggregateStats
 * @property {number} totalAttempts
 * @property {number} [terminalAttempts]
 * @property {boolean} [hasActiveAttempt]
 */

/**
 * @typedef {object} RetakePolicyEvaluation
 * @property {number|null} maxAttempts
 * @property {boolean} canResumeActive
 * @property {boolean} canCreateNew
 * @property {string|null} denyReason
 * @property {string|null} denyCode
 */

/**
 * @param {unknown} value
 * @returns {number|null} null when unlimited
 */
export function normalizeMaxAttempts(value) {
  const max = Number(value ?? 1);
  if (!Number.isFinite(max) || max <= 0) return null;
  return max;
}

/**
 * Pure policy evaluation — no I/O.
 *
 * Business rules:
 * - Active `in_progress` attempt → resume always allowed; no concurrent new attempt.
 * - `max_attempts` caps total attempt rows per student/test (all statuses count).
 * - `max_attempts <= 0` or unset → unlimited attempts.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {AttemptAggregateStats} stats
 * @returns {RetakePolicyEvaluation}
 */
export function evaluateRetakePolicy(testRow, stats) {
  const maxAttempts = normalizeMaxAttempts(testRow?.max_attempts);
  const totalAttempts = Math.max(0, Number(stats.totalAttempts ?? 0));
  const hasActiveAttempt = Boolean(stats.hasActiveAttempt);

  if (hasActiveAttempt) {
    return {
      maxAttempts,
      canResumeActive: true,
      canCreateNew: false,
      denyReason: null,
      denyCode: null,
    };
  }

  if (maxAttempts != null && totalAttempts >= maxAttempts) {
    return {
      maxAttempts,
      canResumeActive: false,
      canCreateNew: false,
      denyReason: 'Maximum attempts reached for this test.',
      denyCode: 'MAX_ATTEMPTS_REACHED',
    };
  }

  return {
    maxAttempts,
    canResumeActive: false,
    canCreateNew: true,
    denyReason: null,
    denyCode: null,
  };
}

/**
 * Fail-closed guard before inserting a new attempt row.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {AttemptAggregateStats} stats — must reflect transaction-locked counts
 * @param {{ testId?: number, context?: string }} [options]
 */
export function assertCanCreateNewTestAttempt(testRow, stats, options = {}) {
  const evaluation = evaluateRetakePolicy(testRow, {
    ...stats,
    hasActiveAttempt: false,
  });

  if (evaluation.canCreateNew) {
    return evaluation;
  }

  const testId = options.testId ?? testRow?.id ?? null;
  const code = evaluation.denyCode ?? 'RETAKE_DENIED';
  const message = evaluation.denyReason ?? 'Cannot start a new attempt for this test.';

  throw new ApiError(403, message, {
    code,
    testId,
    maxAttempts: evaluation.maxAttempts,
    totalAttempts: Math.max(0, Number(stats.totalAttempts ?? 0)),
    context: options.context ?? 'testRetakePolicy.assertCanCreateNewTestAttempt',
  });
}

/**
 * @param {RetakePolicyEvaluation} evaluation
 * @param {boolean} hasActiveAttempt
 */
export function computePrepCanStart(evaluation, hasActiveAttempt) {
  if (hasActiveAttempt) {
    return evaluation.canResumeActive;
  }
  return evaluation.canCreateNew;
}

/**
 * Prep.canStart for standalone tests: exam-open + schedule window + retake policy.
 * Do not pass `{ availability, retake }` into computePrepCanStart — that object has no canCreateNew.
 *
 * @param {{
 *   examOpen?: boolean,
 *   availability: { canCreateAttempt?: boolean, canResumeInProgress?: boolean },
 *   retake: RetakePolicyEvaluation,
 *   hasActiveAttempt: boolean,
 * }} input
 */
export function computeEligiblePrepCanStart({
  examOpen = true,
  availability,
  retake,
  hasActiveAttempt,
}) {
  if (!availability || !retake) return false;
  if (hasActiveAttempt) {
    return Boolean(retake.canResumeActive) && availability.canResumeInProgress !== false;
  }
  if (!examOpen) return false;
  return Boolean(availability.canCreateAttempt) && Boolean(retake.canCreateNew);
}

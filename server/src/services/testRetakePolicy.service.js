/**
 * G-RT-04 — Authoritative test retake policy (`allow_retake` + `max_attempts`).
 *
 * Terminal attempt statuses consume the student's attempt slot when retake is disabled.
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
 * @property {boolean} allowRetake
 * @property {number|null} maxAttempts
 * @property {boolean} canResumeActive
 * @property {boolean} canCreateNew
 * @property {string|null} denyReason
 * @property {string|null} denyCode
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isAllowRetakeEnabled(value) {
  return Boolean(Number(value ?? 0));
}

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
 * - `allow_retake = false` → at most one attempt row per student/test (any status); only resume if in progress.
 * - `allow_retake = true` → new attempts allowed until `max_attempts` exhausted (all statuses count).
 * - Terminal states: `submitted` (pass/fail), `expired` (timer/auto), abandoned = still `in_progress` until expiry.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 * @param {AttemptAggregateStats} stats
 * @returns {RetakePolicyEvaluation}
 */
export function evaluateRetakePolicy(testRow, stats) {
  const allowRetake = isAllowRetakeEnabled(testRow?.allow_retake);
  const maxAttempts = normalizeMaxAttempts(testRow?.max_attempts);
  const totalAttempts = Math.max(0, Number(stats.totalAttempts ?? 0));
  const hasActiveAttempt = Boolean(stats.hasActiveAttempt);

  if (hasActiveAttempt) {
    return {
      allowRetake,
      maxAttempts,
      canResumeActive: true,
      canCreateNew: false,
      denyReason: null,
      denyCode: null,
    };
  }

  if (!allowRetake && totalAttempts > 0) {
    return {
      allowRetake,
      maxAttempts,
      canResumeActive: false,
      canCreateNew: false,
      denyReason: 'Retakes are not allowed for this test.',
      denyCode: 'RETAKE_NOT_ALLOWED',
    };
  }

  if (maxAttempts != null && totalAttempts >= maxAttempts) {
    return {
      allowRetake,
      maxAttempts,
      canResumeActive: false,
      canCreateNew: false,
      denyReason: 'Maximum attempts reached for this test.',
      denyCode: 'MAX_ATTEMPTS_REACHED',
    };
  }

  return {
    allowRetake,
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
    allowRetake: evaluation.allowRetake,
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

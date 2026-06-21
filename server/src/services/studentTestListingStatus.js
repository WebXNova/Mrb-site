/**
 * Student test listing status rules (Phase 1D).
 */

/** @typedef {'available' | 'in_progress' | 'completed'} StudentTestListingStatus */

export const STUDENT_TEST_LISTING_STATUSES = Object.freeze(['available', 'in_progress', 'completed']);

/** Attempt row status for active sessions. */
export const ACTIVE_ATTEMPT_STATUS = 'in_progress';

/**
 * Compute listing status from aggregated attempt data.
 *
 * Priority: in_progress > completed > available
 *
 * @param {{
 *   maxAttempts: number,
 *   attemptsUsed: number,
 *   activeAttemptId?: number|null,
 *   allowRetake?: boolean,
 * }} input
 * @returns {{
 *   status: StudentTestListingStatus,
 *   active_attempt_id: number|null,
 *   attempts_used: number,
 *   attempts_remaining: number|null,
 * }}
 */
export function computeStudentTestListingStatus(input) {
  const maxAttempts = Number(input.maxAttempts ?? 1);
  const attemptsUsed = Math.max(0, Number(input.attemptsUsed ?? 0));
  const allowRetake = input.allowRetake == null ? true : Boolean(input.allowRetake);
  const activeAttemptId =
    input.activeAttemptId == null || input.activeAttemptId === ''
      ? null
      : Number(input.activeAttemptId);

  const hasActiveAttempt =
    Number.isInteger(activeAttemptId) && activeAttemptId > 0;

  const attemptsRemaining =
    maxAttempts > 0 ? Math.max(0, maxAttempts - attemptsUsed) : null;

  if (hasActiveAttempt) {
    return {
      status: 'in_progress',
      active_attempt_id: activeAttemptId,
      attempts_used: attemptsUsed,
      attempts_remaining: attemptsRemaining,
    };
  }

  if (maxAttempts > 0 && attemptsUsed >= maxAttempts) {
    return {
      status: 'completed',
      active_attempt_id: null,
      attempts_used: attemptsUsed,
      attempts_remaining: 0,
    };
  }

  if (!allowRetake && attemptsUsed > 0) {
    return {
      status: 'completed',
      active_attempt_id: null,
      attempts_used: attemptsUsed,
      attempts_remaining: 0,
    };
  }

  return {
    status: 'available',
    active_attempt_id: null,
    attempts_used: attemptsUsed,
    attempts_remaining: attemptsRemaining,
  };
}

/**
 * Reusable guard: validate that the attempt is currently active (in_progress + not expired).
 *
 * Use this from:
 *  - load attempt (Phase 2B)
 *  - save answer (Phase 2C)
 *  - submit test (Phase 2E)
 */

import { validateAttemptTimer } from './attemptTimerValidation.service.js';

/**
 * @param {object} input
 * @param {number} input.attemptId
 * @param {{ status?: string, expires_at?: unknown } | null} [input.attemptRow]
 * @param {number} [input.nowMs]
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [input.executor]
 * @param {boolean} [input.markExpired]
 */
export async function assertAttemptActive(input) {
  await validateAttemptTimer(input.attemptId, {
    attemptRow: input.attemptRow ?? null,
    nowMs: input.nowMs,
    executor: input.executor,
    markExpired: input.markExpired,
  });
}


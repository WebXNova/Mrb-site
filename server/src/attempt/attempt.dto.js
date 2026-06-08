import { toApiAttemptStatus } from './attempt.constants.js';

/**
 * @param {Record<string, unknown>} row
 * @param {number} [nowMs]
 */
export function toAttemptSessionDto(row, nowMs = Date.now()) {
  const expiresAt = row.expires_at == null ? null : String(row.expires_at);
  let remainingSeconds = 0;
  if (expiresAt) {
    const expiresMs = new Date(expiresAt.replace(' ', 'T')).getTime();
    if (!Number.isNaN(expiresMs)) {
      remainingSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
    }
  }

  return {
    attemptId: Number(row.id),
    testId: Number(row.test_id),
    status: toApiAttemptStatus(row.status),
    startedAt: row.started_at == null ? null : String(row.started_at),
    expiresAt,
    remainingSeconds,
  };
}

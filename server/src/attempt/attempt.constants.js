/**
 * Attempt session core — status and security constants.
 *
 * DB stores `in_progress`; API exposes `active` for client clarity.
 * DB stores `attempt_nonce`; treated as attempt_token for validation.
 */

/** @readonly */
export const ATTEMPT_DB_STATUS = Object.freeze({
  ACTIVE: 'in_progress',
  SUBMITTED: 'submitted',
  EXPIRED: 'expired',
});

/** @readonly */
export const ATTEMPT_API_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUBMITTED: 'submitted',
  EXPIRED: 'expired',
});

/** Maps DB status → API status. */
export function toApiAttemptStatus(dbStatus) {
  const normalized = String(dbStatus ?? '').toLowerCase();
  if (normalized === ATTEMPT_DB_STATUS.ACTIVE) return ATTEMPT_API_STATUS.ACTIVE;
  if (normalized === ATTEMPT_DB_STATUS.SUBMITTED) return ATTEMPT_API_STATUS.SUBMITTED;
  if (normalized === ATTEMPT_DB_STATUS.EXPIRED) return ATTEMPT_API_STATUS.EXPIRED;
  return normalized;
}

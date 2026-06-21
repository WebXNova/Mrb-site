/**
 * User-facing API error normalization — enrollment and admission gates.
 */

export const ERROR_CODES = Object.freeze({
  ADMISSIONS_CLOSED: 'ADMISSIONS_CLOSED',
  DUPLICATE_ACTIVE_ENROLLMENT: 'DUPLICATE_ACTIVE_ENROLLMENT',
  ENROLLMENT_SWITCH_CONFIRMATION_REQUIRED: 'ENROLLMENT_SWITCH_CONFIRMATION_REQUIRED',
  PREMIUM_ACCESS_PROTECTED: 'PREMIUM_ACCESS_PROTECTED',
  ENROLLMENT_ACTIVATION_DENIED: 'ENROLLMENT_ACTIVATION_DENIED',
  CONFLICT: 'CONFLICT',
});

const ENROLLMENT_CLOSED_ALIASES = new Set([
  ERROR_CODES.ADMISSIONS_CLOSED,
  'ENROLLMENT_CLOSED',
  'ADMISSION_CLOSED',
]);

const FRIENDLY_MESSAGES = Object.freeze({
  [ERROR_CODES.ADMISSIONS_CLOSED]:
    'Admissions are currently closed for this course. If you are already enrolled, continue learning from your dashboard.',
  [ERROR_CODES.DUPLICATE_ACTIVE_ENROLLMENT]:
    'You already have active access to this course. Continue learning from your dashboard.',
  [ERROR_CODES.ENROLLMENT_SWITCH_CONFIRMATION_REQUIRED]:
    'Please confirm the course switch before completing enrollment.',
  [ERROR_CODES.PREMIUM_ACCESS_PROTECTED]:
    'Your premium course access cannot be replaced without explicit confirmation.',
  [ERROR_CODES.ENROLLMENT_ACTIVATION_DENIED]: 'This enrollment action is not allowed.',
  [ERROR_CODES.CONFLICT]: 'This action conflicts with your current enrollment.',
});

/**
 * @param {unknown} err
 * @returns {string|null}
 */
export function extractErrorCode(err) {
  if (!err || typeof err !== 'object') return null;
  const code = err.errorCode ?? err.code ?? err.responseData?.error?.code ?? err.responseData?.errorCode;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

/**
 * @param {unknown} err
 */
export function isEnrollmentClosedError(err) {
  const code = extractErrorCode(err);
  if (code && ENROLLMENT_CLOSED_ALIASES.has(code)) return true;
  const status = Number(err?.status);
  if (status !== 403) return false;
  const message = String(err?.message || '').toLowerCase();
  return message.includes('admissions are currently closed') || message.includes('admission');
}

/**
 * @param {unknown} err
 */
export function isHttpStatus(err, status) {
  return Number(err?.status) === Number(status);
}

/**
 * @param {unknown} err
 * @param {string} [fallback='Something went wrong. Please try again.']
 */
export function getUserFacingErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback;

  if (isEnrollmentClosedError(err)) {
    const code = extractErrorCode(err);
    if (code && FRIENDLY_MESSAGES[code]) return FRIENDLY_MESSAGES[code];
    const msg = typeof err.message === 'string' ? err.message.trim() : '';
    if (msg) return msg;
    return FRIENDLY_MESSAGES[ERROR_CODES.ADMISSIONS_CLOSED];
  }

  const code = extractErrorCode(err);
  if (code && FRIENDLY_MESSAGES[code]) return FRIENDLY_MESSAGES[code];

  const msg = typeof err.message === 'string' ? err.message.trim() : '';
  return msg || fallback;
}

/**
 * @param {unknown} err
 * @param {{ fallback?: string }} [options]
 */
export function parseApiError(err, options = {}) {
  const { fallback = 'Something went wrong. Please try again.' } = options;
  const code = extractErrorCode(err);
  const status = Number.isFinite(Number(err?.status)) ? Number(err.status) : null;
  return {
    code,
    status,
    message: getUserFacingErrorMessage(err, fallback),
    isEnrollmentClosed: isEnrollmentClosedError(err),
    isForbidden: status === 403,
    raw: err,
  };
}

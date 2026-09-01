export const TEST_ACCESS_ERROR_CODES = Object.freeze([
  'TEST_NOT_ACCESSIBLE',
  'TEST_NOT_FOUND',
  'COURSE_ACCESS_MISMATCH',
  'ENROLLMENT_NOT_FOUND',
  'ACCESS_INACTIVE',
  'ACCESS_REVOKED',
  'ACCESS_EXPIRED',
  'MAX_ATTEMPTS_REACHED',
  'ATTEMPT_CREATE_DENIED',
  'RETAKE_DENIED',
]);

const START_REASON_MESSAGES = Object.freeze({
  test_not_published: 'This test is not published yet.',
  test_not_yet_available: 'This test is not available yet.',
  test_no_longer_available: 'This test is no longer available.',
  paid_standalone_seat_not_confirmed: 'Your seat for this test is not confirmed yet.',
  paid_standalone_exam_not_open: 'This test is not open yet.',
  free_standalone_exam_not_open: 'This test is not open yet.',
  free_standalone_seats_full: 'All seats for this test are taken.',
  exam_integrity_blocked:
    'This test is locked for your account after repeated focus warnings. Other tests are not affected.',
});

/** @param {unknown} err */
function readErrorCode(err) {
  return String(
    err?.errorCode ?? err?.code ?? err?.responseData?.error?.code ?? ''
  ).trim();
}

/** @param {unknown} err */
function readErrorReason(err) {
  return String(
    err?.details?.reason ?? err?.responseData?.details?.reason ?? err?.reason ?? ''
  ).trim();
}

/**
 * Student-facing message for test access / start failures.
 *
 * @param {unknown} err
 * @param {string} [fallback]
 */
export function getTestAccessErrorMessage(err, fallback = 'Unable to load this test.') {
  const code = readErrorCode(err);
  const reason = readErrorReason(err);
  if (reason && START_REASON_MESSAGES[reason]) {
    return START_REASON_MESSAGES[reason];
  }

  if (code === 'MAX_ATTEMPTS_REACHED' || code === 'RETAKE_DENIED' || code === 'ATTEMPT_CREATE_DENIED') {
    const message = String(err?.message || '').trim();
    return message || 'You cannot start a new attempt for this test.';
  }
  if (code === 'COURSE_ACCESS_MISMATCH') {
    return 'This test is not part of your enrolled course.';
  }
  if (code === 'ENROLLMENT_NOT_FOUND') {
    return 'No active enrollment was found for your account.';
  }
  if (code === 'ACCESS_INACTIVE' || code === 'ACCESS_REVOKED' || code === 'ACCESS_EXPIRED') {
    return 'Your enrollment does not allow access to this test.';
  }
  if (/invalid csrf token/i.test(String(err?.message || ''))) {
    return 'Your session expired. Refresh the page and try starting the test again.';
  }

  const message = String(err?.message || '').trim();
  if (message && !/^test unavailable$/i.test(message)) return message;
  if (code === 'TEST_NOT_FOUND') return 'This test was not found.';
  return fallback;
}

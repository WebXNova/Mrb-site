/** @param {unknown} err */
function readErrorCode(err) {
  if (!err || typeof err !== 'object') return '';
  const code = err.errorCode ?? err.code ?? err.responseData?.error?.code ?? err.responseData?.errorCode;
  return typeof code === 'string' ? code.trim() : '';
}

/** @param {unknown} err */
function readStatus(err) {
  return Number(err?.status ?? err?.statusCode ?? 0);
}

/** Real attempt timer / expires_at elapsed. */
export function isAttemptExpiredError(err) {
  const code = readErrorCode(err);
  if (code === 'ATTEMPT_EXPIRED') return true;
  const status = readStatus(err);
  if (status === 410) return true;
  if (status === 409 && /attempt has expired|attempt expired/i.test(String(err?.message || ''))) {
    return true;
  }
  return false;
}

/** Attempt JWT / nonce invalid — not student login. */
export function isAttemptTokenError(err) {
  const code = readErrorCode(err);
  if (code === 'ATTEMPT_TOKEN_INVALID' || code === 'ATTEMPT_TOKEN_REQUIRED') return true;
  const message = String(err?.message || '');
  if (/attempt token is invalid|has been rotated|attempt token is required/i.test(message)) {
    return true;
  }
  return false;
}

/** Student auth session 401 without an attempt-token error code. */
export function isStudentAuthError(err) {
  if (isAttemptTokenError(err) || isAttemptExpiredError(err)) return false;
  const status = readStatus(err);
  if (status !== 401) return false;
  const code = readErrorCode(err);
  if (code === 'ATTEMPT_TOKEN_INVALID' || code === 'ATTEMPT_EXPIRED') return false;
  return true;
}

/** @param {unknown} err */
export function isNetworkError(err) {
  return (
    (typeof navigator !== 'undefined' && navigator?.onLine === false) ||
    err?.name === 'TypeError' ||
    /failed to fetch|networkerror|err_network|connection refused/i.test(String(err?.message || ''))
  );
}

/** @param {unknown} err */
export function isTimeoutError(err) {
  return (
    readStatus(err) === 408 ||
    err?.isTimeout === true ||
    err?.name === 'AbortError' ||
    /timeout|timed out|aborted/i.test(String(err?.message || ''))
  );
}

/** @param {unknown} err */
export function getAttemptErrorMessage(err, fallback = 'Something went wrong.') {
  if (isAttemptExpiredError(err)) {
    return 'Time ran out. Your answers were saved, but submission wasn\'t accepted in time.';
  }
  if (isAttemptTokenError(err)) {
    return 'Your test session was interrupted. Please return to the test start page to resume.';
  }
  if (isStudentAuthError(err)) {
    return 'Your login session expired. Please sign in again to continue.';
  }
  if (isTimeoutError(err)) {
    return 'The request timed out. Please check your connection and try again.';
  }
  if (isNetworkError(err)) {
    return 'Connection lost. Your answers are saved locally and will sync when you reconnect.';
  }
  return String(err?.message || fallback);
}

/** @param {unknown} err */
export function getSubmitErrorMessage(err, fallback = 'Submission failed.') {
  if (isAttemptExpiredError(err)) {
    return 'Time ran out. Your answers were saved, but submission wasn\'t accepted in time.';
  }
  if (isAttemptTokenError(err)) {
    return 'Your test session was interrupted. Please return to the test start page to resume.';
  }
  if (isStudentAuthError(err)) {
    return 'Your login session expired. Please sign in again, then return to the test start page.';
  }
  if (isTimeoutError(err)) {
    return 'Submission timed out. Your answers are saved — please try again.';
  }
  if (isNetworkError(err)) {
    return 'Network error during submission. Your answers are saved — please try again.';
  }
  return String(err?.message || fallback);
}

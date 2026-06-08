/** @param {unknown} err */
export function isAttemptTokenError(err) {
  const message = String(err?.message || '');
  return (
    err?.status === 401 ||
    err?.status === 403 ||
    /rotated|invalid.*token|attempt token|expired|access denied/i.test(message)
  );
}

/** @param {unknown} err */
export function isNetworkError(err) {
  return (
    !navigator.onLine ||
    err?.name === 'TypeError' ||
    /network|fetch|failed to fetch|connection/i.test(String(err?.message || ''))
  );
}

/** @param {unknown} err */
export function isTimeoutError(err) {
  return (
    err?.status === 408 ||
    err?.isTimeout === true ||
    err?.name === 'AbortError' ||
    /timeout|timed out|aborted/i.test(String(err?.message || ''))
  );
}

/** @param {unknown} err */
export function getAttemptErrorMessage(err, fallback = 'Something went wrong.') {
  if (isTimeoutError(err)) {
    return 'The request timed out. Please check your connection and try again.';
  }
  if (isNetworkError(err)) {
    return 'Connection lost. Your answers are saved locally and will sync when you reconnect.';
  }
  if (isAttemptTokenError(err)) {
    return 'Your session has expired. Please return to the test start page.';
  }
  return String(err?.message || fallback);
}

/** @param {unknown} err */
export function getSubmitErrorMessage(err, fallback = 'Submission failed.') {
  if (isTimeoutError(err)) {
    return 'Submission timed out. Your answers are saved — please try again.';
  }
  if (isNetworkError(err)) {
    return 'Network error during submission. Your answers are saved — please try again.';
  }
  if (isAttemptTokenError(err)) {
    return 'Your session expired before submission completed. Return to the test start page.';
  }
  return String(err?.message || fallback);
}

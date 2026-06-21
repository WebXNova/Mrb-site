/**
 * User-friendly API errors for student question flows (rate limits, abuse, validation).
 */
export function formatRecordingUploadError(err) {
  const status = err?.status ?? null;
  const code = err?.errorCode ?? err?.code ?? err?.data?.error?.code ?? null;
  const message = typeof err?.message === 'string' ? err.message.trim() : '';

  if (code === 'UPLOAD_REJECTED' && message) {
    return message;
  }
  if (status === 400 && message) {
    return message;
  }
  if (status === 413) {
    return message || 'Recording is too large. Please record a shorter message.';
  }
  if (status === 401 || status === 403) {
    return message || 'Your session may have expired. Please sign in again.';
  }
  if (status >= 500) {
    return message || 'Voice upload failed on our side. Please try again in a few minutes.';
  }
  return message || 'Could not upload your voice recording. Please try again.';
}

export function formatStudentQuestionSubmitError(err) {
  const status = err?.status ?? null;
  const code = err?.code ?? err?.errorCode ?? err?.data?.error?.code ?? null;
  const message = typeof err?.message === 'string' ? err.message.trim() : '';

  if (code === 'UPLOAD_REJECTED') {
    return formatRecordingUploadError(err);
  }

  if (status === 429 || code === 'RATE_LIMITED') {
    return (
      message ||
      'You are submitting too quickly. Please wait a minute before sending another question.'
    );
  }
  if (status === 422) {
    return message || 'Please check your question details and try again.';
  }
  if (status === 503) {
    return message || 'Question service is temporarily unavailable. Please try again later.';
  }
  if (status === 401 || status === 403) {
    return message || 'Your session may have expired. Please sign in again.';
  }
  if (status >= 500) {
    return message || 'Something went wrong on our side. Please try again in a few minutes.';
  }
  return message || 'Could not send your question. Please try again.';
}

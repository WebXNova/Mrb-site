/**
 * User-friendly API errors for teacher answer submission.
 */
export function formatTeacherAnswerSubmitError(err) {
  const status = err?.status ?? null;
  const code = err?.code ?? err?.data?.error?.code ?? null;
  const message = typeof err?.message === 'string' ? err.message.trim() : '';

  if (status === 409 || code === 'ANSWER_ALREADY_EXISTS') {
    return message || 'This question already has an answer.';
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return message || 'You are submitting too quickly. Please wait before sending another answer.';
  }
  if (status === 422) {
    return message || 'Please check your answer and try again.';
  }
  if (status === 403 || code === 'QUESTION_ACCESS_DENIED') {
    return message || 'You do not have access to answer this question.';
  }
  if (status === 401) {
    return message || 'Your session may have expired. Please sign in again.';
  }
  if (status >= 500) {
    return message || 'Something went wrong on our side. Please try again in a few minutes.';
  }
  return message || 'Could not submit your answer. Please try again.';
}

/**
 * Maps Result API payload to a view model — no score/grade calculations.
 */

/** @param {Record<string, unknown>|null|undefined} payload */
export function normalizeResultPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  /** Portal envelope { success, data } or legacy flat { success, test_title, ... } */
  const inner =
    payload.success === true && payload.data && typeof payload.data === 'object'
      ? payload.data
      : payload.success === true
        ? payload
        : null;

  if (!inner) return null;

  const answersRaw = inner.answers ?? inner.details;
  const answers = Array.isArray(answersRaw)
    ? answersRaw.map(normalizeReviewItem).filter(Boolean)
    : null;

  return {
    testTitle: String(inner.test_title ?? inner.testTitle ?? 'Test result'),
    testId: inner.test_id ?? inner.testId ?? null,
    submittedAt: inner.submitted_at ?? inner.submittedAt ?? null,
    score: inner.score,
    maxScore: inner.max_score ?? inner.maxScore ?? null,
    percentage: inner.percentage,
    status: String(inner.status ?? inner.passStatus ?? ''),
    correctAnswers: inner.correct_answers ?? inner.correctAnswers ?? inner.correctCount,
    wrongAnswers: inner.wrong_answers ?? inner.wrongAnswers ?? inner.wrongCount,
    unansweredAnswers:
      inner.unanswered_answers ?? inner.unansweredAnswers ?? inner.skippedCount,
    timeTakenSeconds: inner.time_taken_seconds ?? inner.timeTakenSeconds,
    reviewItems: answers,
    hasReview:
      (inner.visibility?.showAnswersAfterSubmit !== false && Array.isArray(answers) && answers.length > 0) ||
      (inner.visibility?.showAnswersAfterSubmit == null && Array.isArray(answers) && answers.length > 0),
    answersWithheld: inner.visibility?.showAnswersAfterSubmit === false,
  };
}

/** @param {Record<string, unknown>|null|undefined} item */
function normalizeReviewItem(item) {
  if (!item || typeof item !== 'object') return null;

  return {
    questionHtml:
      item.question ??
      item.questionText ??
      item.question_text ??
      item.questionHtml ??
      '',
    yourAnswer: item.your_answer ?? item.yourAnswer ?? item.selectedOption ?? '',
    correctAnswer: item.correct_answer ?? item.correctAnswer ?? item.correctOption ?? '',
    status: String(item.status ?? ''),
    explanationHtml:
      item.explanation != null && String(item.explanation).trim() !== ''
        ? String(item.explanation)
        : null,
  };
}

/** @param {unknown} err */
export function getResultErrorState(err) {
  const status = err?.status;
  const message = String(err?.message || '');

  if (status === 403 || /not available|hidden|denied/i.test(message)) {
    return { kind: 'hidden', message: message || 'Results are not available for this test yet.' };
  }
  if (status === 401 || /session expired|authentication/i.test(message)) {
    return { kind: 'unauthorized', message: message || 'Please sign in to view this result.' };
  }
  if (status === 404 || /not found/i.test(message)) {
    return { kind: 'not_found', message: message || 'Result not found.' };
  }
  if (status === 408 || /timeout/i.test(message)) {
    return { kind: 'timeout', message: message || 'The request timed out. Please try again.' };
  }
  if (status === 503 || /network|connect/i.test(message)) {
    return { kind: 'network', message: message || 'Could not reach the server. Please try again.' };
  }

  return { kind: 'error', message: message || 'Could not load your result.' };
}

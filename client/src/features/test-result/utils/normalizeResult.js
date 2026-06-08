/**
 * Maps Result API payload to a view model — no score/grade calculations.
 */

/** @param {Record<string, unknown>|null|undefined} payload */
export function normalizeResultPayload(payload) {
  if (!payload || payload.success !== true) return null;

  const answers = Array.isArray(payload.answers)
    ? payload.answers.map(normalizeReviewItem).filter(Boolean)
    : null;

  return {
    testTitle: String(payload.test_title ?? payload.testTitle ?? 'Test result'),
    testId: payload.test_id ?? payload.testId ?? null,
    submittedAt: payload.submitted_at ?? payload.submittedAt ?? null,
    score: payload.score,
    maxScore: payload.max_score ?? payload.maxScore ?? null,
    percentage: payload.percentage,
    status: String(payload.status ?? ''),
    correctAnswers: payload.correct_answers ?? payload.correctAnswers,
    wrongAnswers: payload.wrong_answers ?? payload.wrongAnswers,
    unansweredAnswers: payload.unanswered_answers ?? payload.unansweredAnswers,
    timeTakenSeconds: payload.time_taken_seconds ?? payload.timeTakenSeconds,
    reviewItems: answers,
    hasReview: Array.isArray(answers) && answers.length > 0,
  };
}

/** @param {Record<string, unknown>|null|undefined} item */
function normalizeReviewItem(item) {
  if (!item || typeof item !== 'object') return null;

  return {
    questionHtml: item.question ?? item.questionText ?? item.question_text ?? '',
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

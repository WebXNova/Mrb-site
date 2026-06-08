import { sanitizeRichHtml } from '../../utils/htmlSanitizer.js';

/**
 * @param {Array<{
 *   questionId: number,
 *   questionText: string,
 *   explanation?: string|null,
 *   marks: number,
 *   effectiveMarks?: number,
 *   options: Array<{ optionId: number, optionText: string, isCorrect: boolean }>,
 * }>} composedQuestions
 * @param {Map<number, number>} answersByQuestionId question_bank.id → question_options.id
 * @param {number} negativeMarking
 */
export function gradeComposedAttempt(composedQuestions, answersByQuestionId, negativeMarking = 0) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let totalPenalty = 0;

  const details = composedQuestions.map((question) => {
    const marks = Number(question.effectiveMarks ?? question.marks ?? 1);
    maxScore += marks;

    const correctOption = (question.options || []).find((o) => o.isCorrect);
    const correctOptionId = correctOption ? Number(correctOption.optionId) : null;
    const selectedOptionId = answersByQuestionId.get(Number(question.questionId)) ?? null;
    const isCorrect =
      selectedOptionId != null &&
      correctOptionId != null &&
      Number(selectedOptionId) === Number(correctOptionId);

    if (isCorrect) {
      score += marks;
      correctCount += 1;
    } else if (selectedOptionId != null && negativeMarking > 0) {
      totalPenalty += negativeMarking;
    }

    const marksAwarded = isCorrect
      ? marks
      : selectedOptionId != null && negativeMarking > 0
        ? -negativeMarking
        : 0;

    const selectedOptionRow = (question.options || []).find(
      (o) => Number(o.optionId) === Number(selectedOptionId)
    );
    const correctOptionText = correctOption ? String(correctOption.optionText ?? '') : '';

    return {
      questionId: question.questionId,
      questionText: sanitizeRichHtml(question.questionText),
      selectedOptionId,
      selectedOptionText: selectedOptionRow ? String(selectedOptionRow.optionText ?? '') : '',
      correctOptionId,
      correctOptionText,
      isCorrect,
      marks,
      marksAwarded,
      options: (question.options || []).map((o) => ({
        id: o.optionId,
        text: o.optionText,
        isCorrect: Boolean(o.isCorrect),
      })),
      selectedOption: selectedOptionId != null ? String(selectedOptionId) : '',
      correctOption: correctOptionId != null ? String(correctOptionId) : '',
      explanation: question.explanation == null ? '' : sanitizeRichHtml(question.explanation),
    };
  });

  score = Math.max(0, score - totalPenalty);
  const wrongCount = details.filter((item) => item.selectedOption && !item.isCorrect).length;
  const skippedCount = details.filter((item) => !item.selectedOption).length;
  const percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(2)) : 0;

  return {
    score,
    maxScore,
    correctCount,
    wrongCount,
    skippedCount,
    percentage,
    details,
  };
}

/**
 * @param {string|number} selectedOption
 * @returns {number}
 */
export function parseSelectedOptionId(selectedOption) {
  const oid = Number(selectedOption);
  if (!Number.isInteger(oid) || oid <= 0) {
    throw new Error('INVALID_OPTION_ID');
  }
  return oid;
}

import { sanitizeRichHtml } from '../../utils/htmlSanitizer.js';
import {
  calculateMarksBasedResult,
  calculateQuestionMarksAwarded,
  resolveQuestionEffectiveMarks,
} from '../../grading/gradingCalculation.js';

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
export function gradeComposedAttempt(composedQuestions, answersByQuestionId, negativeMarking = 0, passingMarks = 0) {
  const gradingQuestions = composedQuestions.map((question) => {
    const correctOption = (question.options || []).find((o) => o.isCorrect);
    return {
      questionId: Number(question.questionId),
      effectiveMarks: resolveQuestionEffectiveMarks(question),
      selectedOptionId: answersByQuestionId.get(Number(question.questionId)) ?? null,
      correctOptionId: correctOption ? Number(correctOption.optionId) : null,
    };
  });

  const aggregate = calculateMarksBasedResult({
    questions: gradingQuestions,
    testConfig: {
      passingMarks: Number(passingMarks ?? 0),
      negativeMarkingEnabled: negativeMarking > 0,
      negativeMarkingValue: negativeMarking,
    },
  });

  const details = composedQuestions.map((question, index) => {
    const marks = resolveQuestionEffectiveMarks(question);
    const gradingRow = gradingQuestions[index];

    const correctOption = (question.options || []).find((o) => o.isCorrect);
    const correctOptionId = gradingRow.correctOptionId;
    const selectedOptionId = gradingRow.selectedOptionId;
    const isCorrect =
      selectedOptionId != null &&
      correctOptionId != null &&
      Number(selectedOptionId) === Number(correctOptionId);

    const marksAwarded = calculateQuestionMarksAwarded({
      effectiveMarks: marks,
      selectedOptionId,
      correctOptionId,
      negativeMarkingEnabled: negativeMarking > 0,
      negativeMarkingValue: negativeMarking,
    });

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

  const wrongCount = aggregate.wrongAnswers;
  const skippedCount = aggregate.unansweredAnswers;

  return {
    score: aggregate.score,
    maxScore: aggregate.maxScore,
    correctCount: aggregate.correctAnswers,
    wrongCount,
    skippedCount,
    percentage: aggregate.percentage,
    passStatus: aggregate.passStatus,
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

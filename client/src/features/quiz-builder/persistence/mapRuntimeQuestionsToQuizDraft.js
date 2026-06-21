import { createChoice, createQuizQuestion } from '../state/quizQuestionFactory.js';

/**
 * Map admin composed runtime questions into quiz-builder draft shape (read-only published view).
 *
 * @param {Array<Record<string, unknown>>} linkedQuestions
 * @returns {import('../types/quizBuilder.types.js').QuizQuestion[]}
 */
export function mapRuntimeQuestionsToQuizDraft(linkedQuestions) {
  if (!Array.isArray(linkedQuestions) || linkedQuestions.length === 0) {
    return [];
  }

  return linkedQuestions.map((row, index) => {
    const questionId = Number(row.questionId);
    const options = Array.isArray(row.options) ? row.options : [];
    const choices =
      options.length >= 2
        ? options.map((opt) => ({
            id: `runtime-opt-${Number(opt.optionId)}`,
            text: String(opt.optionText ?? ''),
            isCorrect: Boolean(opt.isCorrect),
          }))
        : [createChoice('Choice 1', true), createChoice('Choice 2', false)];

    const explanation = row.explanation == null ? '' : String(row.explanation);

    return {
      id: Number.isFinite(questionId) && questionId > 0 ? `runtime-q-${questionId}` : createQuizQuestion().id,
      title: `Question ${index + 1}`,
      questionText: String(row.questionText ?? ''),
      points: Number(row.effectiveMarks ?? row.marks ?? 1) || 1,
      questionType: 'multiple_choice',
      collapsed: false,
      showExplanation: explanation.trim().length > 0,
      explanation,
      choices,
    };
  });
}

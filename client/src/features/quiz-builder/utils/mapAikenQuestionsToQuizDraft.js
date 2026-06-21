import { createChoice, createQuizQuestion } from '../state/quizQuestionFactory.js';

/**
 * @typedef {{
 *   question_text: string,
 *   explanation?: string | null,
 *   options: Array<{ key: string, text: string }>,
 *   correctAnswer: string,
 * }} AikenValidatedQuestion
 */

/**
 * @param {AikenValidatedQuestion[]} aikenQuestions
 * @param {number} [startIndex]
 * @returns {import('../types/quizBuilder.types.js').QuizQuestion[]}
 */
export function mapAikenQuestionsToQuizDraft(aikenQuestions, startIndex = 0) {
  if (!Array.isArray(aikenQuestions) || aikenQuestions.length === 0) {
    return [];
  }

  return aikenQuestions.map((row, offset) => {
    const questionNumber = startIndex + offset + 1;
    const explanation = row.explanation == null ? '' : String(row.explanation);
    const correctKey = String(row.correctAnswer ?? '').trim().toUpperCase();

    const choices = (row.options ?? []).map((option) =>
      createChoice(
        String(option.text ?? ''),
        String(option.key ?? '').trim().toUpperCase() === correctKey
      )
    );

    return {
      id: createQuizQuestion().id,
      title: `Question ${questionNumber}`,
      questionText: String(row.question_text ?? ''),
      points: 1,
      questionType: 'multiple_choice',
      collapsed: false,
      showExplanation: explanation.trim().length > 0,
      explanation,
      choices: choices.length >= 2 ? choices : [createChoice('Choice 1', true), createChoice('Choice 2', false)],
    };
  });
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} existing
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} imported
 */
export function mergeAikenIntoQuizDraft(existing, imported) {
  if (!imported.length) {
    return existing;
  }

  const isPlaceholderOnly =
    existing.length === 1 && !String(existing[0]?.questionText ?? '').trim();

  const base = isPlaceholderOnly ? [] : existing;
  const startIndex = base.length;

  const numberedImported = imported.map((question, offset) => ({
    ...question,
    title: `Question ${startIndex + offset + 1}`,
  }));

  return [...base, ...numberedImported];
}

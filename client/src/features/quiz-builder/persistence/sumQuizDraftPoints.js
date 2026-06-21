/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
 */
export function sumQuizDraftPoints(questions) {
  if (!Array.isArray(questions)) return 0;
  return questions.reduce((sum, question) => sum + (Number(question?.points) || 0), 0);
}

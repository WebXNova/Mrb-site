/** @typedef {import('../types/quizBuilder.types.js').QuizDraftItem} QuizDraftItem */
/** @typedef {import('../types/quizBuilder.types.js').QuizQuestion} QuizQuestion */
/** @typedef {import('../types/quizBuilder.types.js').QuizSection} QuizSection */

export const QUIZ_DRAFT_ITEM_TYPE = Object.freeze({
  QUESTION: 'question',
  SECTION: 'section',
});

/**
 * @param {unknown} item
 * @returns {item is QuizSection}
 */
export function isQuizSection(item) {
  return Boolean(item && typeof item === 'object' && /** @type {{ itemType?: string }} */ (item).itemType === QUIZ_DRAFT_ITEM_TYPE.SECTION);
}

/**
 * @param {unknown} item
 * @returns {item is QuizQuestion}
 */
export function isQuizQuestion(item) {
  return !isQuizSection(item);
}

/**
 * @param {QuizDraftItem[] | null | undefined} items
 * @returns {QuizQuestion[]}
 */
export function filterQuizQuestions(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isQuizQuestion);
}

/**
 * @param {QuizDraftItem[] | null | undefined} items
 * @returns {QuizSection[]}
 */
export function filterQuizSections(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isQuizSection);
}

/**
 * 1-based question number for a list index (sections do not increment the count).
 * @param {QuizDraftItem[]} items
 * @param {number} index
 */
export function getQuestionDisplayNumber(items, index) {
  let count = 0;
  for (let i = 0; i <= index; i += 1) {
    if (isQuizQuestion(items[i])) count += 1;
  }
  return count;
}

/**
 * Sum MCQ points — sections contribute zero.
 * @param {QuizDraftItem[] | null | undefined} items
 */
export function sumQuizQuestionPoints(items) {
  return filterQuizQuestions(items).reduce((sum, question) => sum + (Number(question.points) || 0), 0);
}

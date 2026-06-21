import {
  QUIZ_DRAFT_STORAGE_VERSION,
  normalizeStoredQuestions,
} from './quizDraftStorage.js';

/**
 * @param {{
 *   testId: string|number,
 *   storageKey: string,
 *   questions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *   totalPoints: number,
 *   savedAt?: string,
 * }} input
 */
export function buildQuizDraftPayload({ testId, storageKey, questions, totalPoints, savedAt }) {
  const normalized = normalizeStoredQuestions(questions);
  if (!normalized) {
    throw new Error('Cannot build draft payload from invalid questions.');
  }

  return {
    version: QUIZ_DRAFT_STORAGE_VERSION,
    testId: Number(testId),
    storageKey,
    questions: normalized,
    totalPoints: Number(totalPoints) || 0,
    savedAt: savedAt || new Date().toISOString(),
  };
}

/**
 * @param {unknown} draftPayload
 * @returns {import('../types/quizBuilder.types.js').QuizQuestion[]|null}
 *   Returns [] for a valid empty question list, null when corrupt.
 */
export function extractQuestionsFromServerPayload(draftPayload) {
  if (!draftPayload || typeof draftPayload !== 'object') return null;
  const questions = /** @type {{ questions?: unknown }} */ (draftPayload).questions;
  if (!Array.isArray(questions)) return null;
  if (questions.length === 0) return [];
  return normalizeStoredQuestions(questions);
}

import {
  QUIZ_DRAFT_STORAGE_VERSION,
  normalizeStoredQuestions,
} from './quizDraftStorage.js';
import { filterPersistableQuizDraftQuestions } from '../validation/quizMcqClientValidation.js';
import { isQuizSection } from '../utils/quizDraftItems.js';
import { normalizeQuizSection } from '../utils/normalizeQuizSection.js';

/**
 * Preserve list order for server sync: all sections plus complete MCQ questions only.
 * Incomplete placeholders remain local-only (existing behavior).
 *
 * @param {import('../types/quizBuilder.types.js').QuizDraftItem[]} items
 */
export function buildOrderedDraftForServerSave(items) {
  if (!Array.isArray(items)) return [];
  const persistableIds = new Set(filterPersistableQuizDraftQuestions(items).map((question) => question.id));
  return items
    .filter((item) => isQuizSection(item) || persistableIds.has(item.id))
    .map((item) => (isQuizSection(item) ? normalizeQuizSection(item) ?? item : item));
}

/**
 * @param {{
 *   testId: string|number,
 *   storageKey: string,
 *   questions: import('../types/quizBuilder.types.js').QuizDraftItem[],
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
 * @returns {import('../types/quizBuilder.types.js').QuizDraftItem[]|null}
 *   Returns [] for a valid empty question list, null when corrupt.
 */
export function extractQuestionsFromServerPayload(draftPayload) {
  if (!draftPayload || typeof draftPayload !== 'object') return null;
  const questions = /** @type {{ questions?: unknown }} */ (draftPayload).questions;
  if (!Array.isArray(questions)) return null;
  if (questions.length === 0) return [];
  return normalizeStoredQuestions(questions);
}

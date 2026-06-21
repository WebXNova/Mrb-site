import { QUIZ_MCQ_MAX_OPTIONS, QUIZ_MCQ_MIN_OPTIONS, QUIZ_MCQ_MIN_POINTS } from '../validation/quizMcqLimits.js';
import { initialQuizBuilderState } from '../state/quizBuilderReducer.js';

export const QUIZ_DRAFT_STORAGE_VERSION = 1;
export const QUIZ_DRAFT_DEBOUNCE_MS = 800;

/**
 * @param {string} storageKey
 */
export function getQuizDraftStorageKey(storageKey) {
  return `quiz-builder-draft:${storageKey}`;
}

/**
 * @param {unknown} choice
 */
function isValidChoice(choice) {
  return (
    choice &&
    typeof choice === 'object' &&
    typeof choice.id === 'string' &&
    typeof choice.text === 'string' &&
    typeof choice.isCorrect === 'boolean'
  );
}

/**
 * @param {unknown} question
 */
function isValidQuestion(question) {
  if (!question || typeof question !== 'object') return false;
  const q = /** @type {Record<string, unknown>} */ (question);
  return (
    typeof q.id === 'string' &&
    typeof q.title === 'string' &&
    typeof q.questionText === 'string' &&
    typeof q.points === 'number' &&
    typeof q.questionType === 'string' &&
    typeof q.collapsed === 'boolean' &&
    typeof q.showExplanation === 'boolean' &&
    typeof q.explanation === 'string' &&
    Array.isArray(q.choices) &&
    q.choices.length >= QUIZ_MCQ_MIN_OPTIONS &&
    q.choices.length <= QUIZ_MCQ_MAX_OPTIONS &&
    typeof q.points === 'number' &&
    Number.isFinite(q.points) &&
    q.points >= QUIZ_MCQ_MIN_POINTS &&
    q.choices.every(isValidChoice)
  );
}

/**
 * @param {unknown} questions
 * @returns {import('../types/quizBuilder.types.js').QuizQuestion[] | null}
 */
export function normalizeStoredQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  if (!questions.every(isValidQuestion)) return null;
  return /** @type {import('../types/quizBuilder.types.js').QuizQuestion[]} */ (questions);
}

/** @typedef {'synced' | 'pending'} QuizDraftSyncState */

/**
 * @param {string | undefined | null} storageKey
 * @returns {{
 *   status: 'missing' | 'corrupt' | 'ok',
 *   record: {
 *     questions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *     savedAt: string|null,
 *     serverVersion: number|null,
 *     totalPoints: number,
 *     syncState: QuizDraftSyncState,
 *   }|null,
 * }}
 */
export function inspectLocalDraft(storageKey) {
  if (!storageKey || typeof localStorage === 'undefined') {
    return { status: 'missing', record: null };
  }

  try {
    const raw = localStorage.getItem(getQuizDraftStorageKey(storageKey));
    if (!raw) return { status: 'missing', record: null };

    const parsed = JSON.parse(raw);
    const questions = normalizeStoredQuestions(parsed?.questions);
    if (!questions) return { status: 'corrupt', record: null };

    const serverVersion =
      parsed?.serverVersion == null ? null : Number(parsed.serverVersion);
    const savedAt = typeof parsed?.savedAt === 'string' ? parsed.savedAt : null;
    const totalPoints = Number(parsed?.totalPoints) || 0;
    const syncState = parsed?.syncState === 'pending' ? 'pending' : 'synced';

    return {
      status: 'ok',
      record: {
        questions,
        savedAt,
        serverVersion: Number.isFinite(serverVersion) && serverVersion > 0 ? serverVersion : null,
        totalPoints,
        syncState,
      },
    };
  } catch {
    return { status: 'corrupt', record: null };
  }
}

/**
 * @param {string | undefined | null} storageKey
 * @returns {{
 *   questions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *   savedAt: string|null,
 *   serverVersion: number|null,
 *   totalPoints: number,
 *   syncState: QuizDraftSyncState,
 * }|null}
 */
export function readLocalDraftRecord(storageKey) {
  const inspected = inspectLocalDraft(storageKey);
  return inspected.record;
}

/**
 * @param {string | undefined | null} storageKey
 * @returns {import('../types/quizBuilder.types.js').QuizBuilderState}
 */
export function readQuizDraft(storageKey) {
  const record = readLocalDraftRecord(storageKey);
  if (!record) return { ...initialQuizBuilderState };
  return { questions: record.questions, isDirty: false };
}

/**
 * @param {string | undefined | null} storageKey
 * @returns {string | null}
 */
export function readQuizDraftSavedAt(storageKey) {
  if (!storageKey || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getQuizDraftStorageKey(storageKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.savedAt === 'string' ? parsed.savedAt : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   storageKey: string,
 *   testId?: string | null,
 *   questions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *   totalPoints: number,
 *   syncState?: QuizDraftSyncState,
 * }} payload
 */
export function writeQuizDraft({
  storageKey,
  testId,
  questions,
  totalPoints,
  serverVersion = undefined,
  savedAt: savedAtOverride = undefined,
  syncState = undefined,
}) {
  if (!storageKey || typeof localStorage === 'undefined') {
    throw new Error('Draft storage is unavailable.');
  }

  const normalized = normalizeStoredQuestions(questions);
  if (!normalized) {
    throw new Error('Cannot save invalid question draft.');
  }

  const existing = readLocalDraftRecord(storageKey);
  const savedAt = savedAtOverride || new Date().toISOString();
  const resolvedServerVersion =
    serverVersion === undefined
      ? (existing?.serverVersion ?? null)
      : serverVersion == null
        ? null
        : Number(serverVersion);

  const resolvedSyncState =
    syncState === 'pending' || syncState === 'synced'
      ? syncState
      : existing?.syncState === 'pending'
        ? 'pending'
        : 'synced';

  const record = {
    version: QUIZ_DRAFT_STORAGE_VERSION,
    storageKey,
    testId: testId || null,
    questions: normalized,
    totalPoints,
    savedAt,
    syncState: resolvedSyncState,
    serverVersion:
      Number.isFinite(resolvedServerVersion) && resolvedServerVersion > 0
        ? resolvedServerVersion
        : null,
  };

  localStorage.setItem(getQuizDraftStorageKey(storageKey), JSON.stringify(record));
  return savedAt;
}

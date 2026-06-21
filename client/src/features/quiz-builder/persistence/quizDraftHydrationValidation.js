import { QUIZ_DRAFT_STORAGE_VERSION } from './quizDraftStorage.js';
import { extractQuestionsFromServerPayload } from './quizDraftPayload.js';

/**
 * @typedef {'ok' | 'no_draft' | 'corrupt_payload' | 'test_id_mismatch' | 'invalid_envelope'} HydrationValidationCode
 */

/**
 * @typedef {object} HydrationValidationSuccess
 * @property {true} ok
 * @property {HydrationValidationCode} code
 * @property {boolean} hasServerDraft
 * @property {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
 * @property {string|null} savedAt
 * @property {number|null} serverVersion
 * @property {number|null} draftId
 * @property {string|null} lastModified
 */

/**
 * @typedef {object} HydrationValidationFailure
 * @property {false} ok
 * @property {HydrationValidationCode} code
 * @property {string} message
 */

/**
 * @param {string|number} expectedTestId
 * @param {unknown} responseData
 * @returns {HydrationValidationSuccess | HydrationValidationFailure}
 */
export function validateServerDraftHydrationResponse(expectedTestId, responseData) {
  const expectedId = Number(expectedTestId);
  if (!Number.isInteger(expectedId) || expectedId <= 0) {
    return {
      ok: false,
      code: 'invalid_envelope',
      message: 'Invalid test id for draft hydration.',
    };
  }

  if (!responseData || typeof responseData !== 'object') {
    return {
      ok: false,
      code: 'invalid_envelope',
      message: 'Draft response envelope is invalid.',
    };
  }

  const envelopeTestId = Number(/** @type {{ testId?: unknown }} */ (responseData).testId);
  if (Number.isInteger(envelopeTestId) && envelopeTestId > 0 && envelopeTestId !== expectedId) {
    return {
      ok: false,
      code: 'test_id_mismatch',
      message: 'Draft response test id does not match the requested test.',
    };
  }

  const draft = /** @type {{ draft?: unknown }} */ (responseData).draft ?? null;
  if (!draft || typeof draft !== 'object') {
    return {
      ok: true,
      code: 'no_draft',
      hasServerDraft: false,
      questions: [],
      savedAt: null,
      serverVersion: null,
      draftId: null,
      lastModified: null,
    };
  }

  const draftRow = /** @type {Record<string, unknown>} */ (draft);
  const draftId = draftRow.draftId == null ? null : Number(draftRow.draftId);
  const serverVersion = draftRow.version == null ? null : Number(draftRow.version);
  const draftPayload = draftRow.draftPayload;

  if (!draftPayload || typeof draftPayload !== 'object') {
    return {
      ok: false,
      code: 'corrupt_payload',
      message: 'Server draft payload is missing or malformed.',
    };
  }

  const payload = /** @type {Record<string, unknown>} */ (draftPayload);
  const payloadTestId = Number(payload.testId);
  if (!Number.isInteger(payloadTestId) || payloadTestId <= 0 || payloadTestId !== expectedId) {
    return {
      ok: false,
      code: 'test_id_mismatch',
      message: 'Draft payload test id does not match the requested test.',
    };
  }

  if (payload.version != null && Number(payload.version) !== QUIZ_DRAFT_STORAGE_VERSION) {
    return {
      ok: false,
      code: 'corrupt_payload',
      message: 'Draft schema version is not supported.',
    };
  }

  const questions = extractQuestionsFromServerPayload(payload);
  if (questions === null) {
    return {
      ok: false,
      code: 'corrupt_payload',
      message: 'Server draft questions failed structural validation.',
    };
  }

  const lastModified =
    typeof draftRow.lastModified === 'string'
      ? draftRow.lastModified
      : typeof draftRow.updatedAt === 'string'
        ? draftRow.updatedAt
        : null;

  const savedAt =
    typeof payload.savedAt === 'string' ? payload.savedAt : lastModified;

  return {
    ok: true,
    code: 'ok',
    hasServerDraft: true,
    questions,
    savedAt,
    serverVersion: Number.isFinite(serverVersion) && serverVersion > 0 ? serverVersion : null,
    draftId: Number.isFinite(draftId) && draftId > 0 ? draftId : null,
    lastModified,
  };
}

/**
 * @param {unknown} error
 * @returns {{ kind: string, message: string, retryable: boolean }}
 */
export function classifyHydrationError(error) {
  const status = Number(error?.status);
  const message = error instanceof Error ? error.message : 'Failed to load quiz draft.';

  if (status === 401) {
    return {
      kind: 'session_expired',
      message: 'Your session expired. Sign in again to load questions from the server.',
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      kind: 'forbidden',
      message: 'You do not have permission to access this test draft.',
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      kind: 'not_found',
      message: 'Test or draft was not found.',
      retryable: false,
    };
  }

  if (status === 408 || status === 503 || status === 0 || message.includes('connect')) {
    return {
      kind: 'network',
      message: 'Could not reach the server. Using local backup if available.',
      retryable: true,
    };
  }

  return {
    kind: 'unknown',
    message,
    retryable: true,
  };
}

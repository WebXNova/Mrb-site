import { DRAFT_VERSION_CONFLICT } from './quizDraftServerSave.js';

/**
 * @typedef {object} QuizDraftVersionConflictDetails
 * @property {number} testId
 * @property {number|null} expectedVersion
 * @property {number} currentVersion
 * @property {string|null} lastModified
 * @property {'missing_expected_version'|'stale_version'|'concurrent_update'|string|null} conflictKind
 * @property {object|null} draft
 */

/**
 * Parse A3 version-conflict metadata from a failed PUT response.
 *
 * @param {unknown} error
 * @returns {QuizDraftVersionConflictDetails|null}
 */
export function extractVersionConflictDetails(error) {
  const details = error?.details ?? error?.responseData?.details ?? null;
  if (!details || typeof details !== 'object') return null;

  const row = /** @type {Record<string, unknown>} */ (details);
  const errorCode = error?.errorCode ?? error?.responseData?.error?.code ?? null;
  if (errorCode !== DRAFT_VERSION_CONFLICT && Number(error?.status) !== 409) {
    return null;
  }

  const currentVersion = Number(row.currentVersion);
  if (!Number.isFinite(currentVersion) || currentVersion <= 0) return null;

  const expectedRaw = row.expectedVersion;
  const expectedVersion =
    expectedRaw == null ? null : Number.isFinite(Number(expectedRaw)) ? Number(expectedRaw) : null;

  const lastModified =
    typeof row.lastModified === 'string'
      ? row.lastModified
      : row.draft && typeof row.draft === 'object' && typeof row.draft.lastModified === 'string'
        ? row.draft.lastModified
        : null;

  return {
    testId: Number(row.testId) || 0,
    expectedVersion,
    currentVersion,
    lastModified,
    conflictKind: typeof row.conflictKind === 'string' ? row.conflictKind : null,
    draft: row.draft && typeof row.draft === 'object' ? row.draft : null,
  };
}

/**
 * @param {QuizDraftVersionConflictDetails} conflict
 */
export function formatConflictMessage(conflict) {
  const serverLabel = conflict.lastModified
    ? `Server last saved ${new Date(conflict.lastModified).toLocaleString()}.`
    : 'The server has a newer version.';

  if (conflict.conflictKind === 'missing_expected_version') {
    return `This test already has a server draft (v${conflict.currentVersion}). ${serverLabel}`;
  }

  if (conflict.conflictKind === 'concurrent_update') {
    return `Another admin saved while you were editing (now v${conflict.currentVersion}). ${serverLabel}`;
  }

  return `Your draft is out of date (you had v${conflict.expectedVersion ?? '?'}, server is v${conflict.currentVersion}). ${serverLabel}`;
}

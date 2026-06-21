import { classifyServerSaveError } from './quizDraftServerSave.js';

/**
 * @typedef {{ code?: string, message?: string, field?: string, optionIndex?: number }} ServerValidationIssue
 */

/**
 * @param {unknown} error
 * @returns {ServerValidationIssue[]}
 */
export function extractServerValidationIssues(error) {
  const details = error?.details ?? error?.responseData?.details ?? null;
  if (!details || typeof details !== 'object') return [];

  const row = /** @type {Record<string, unknown>} */ (details);
  if (Array.isArray(row.issues)) {
    return row.issues.filter((issue) => issue && typeof issue === 'object');
  }

  if (row.legacyDetails && typeof row.legacyDetails === 'object') {
    const legacy = /** @type {Record<string, unknown>} */ (row.legacyDetails);
    if (Array.isArray(legacy.issues)) {
      return legacy.issues.filter((issue) => issue && typeof issue === 'object');
    }
  }

  if (row.fieldErrors && typeof row.fieldErrors === 'object') {
    /** @type {ServerValidationIssue[]} */
    const fromFields = [];
    for (const [field, messages] of Object.entries(row.fieldErrors)) {
      const first = Array.isArray(messages) ? messages.find((m) => typeof m === 'string') : null;
      if (first) fromFields.push({ field, message: first });
    }
    return fromFields;
  }

  return [];
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function formatServerSaveValidationMessage(error) {
  const issues = extractServerValidationIssues(error);
  if (issues.length > 0) {
    const primary = issues[0];
    if (typeof primary.message === 'string' && primary.message.trim()) {
      return primary.message.trim();
    }
  }

  const classified = classifyServerSaveError(error);
  return classified.message || 'Draft failed server validation.';
}

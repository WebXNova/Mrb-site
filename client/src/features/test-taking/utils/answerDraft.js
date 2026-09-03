/**
 * Local answer draft — survives refresh until the attempt is submitted.
 * Server answers remain authoritative after a successful autosave.
 */

function storageKey(slug, attemptId) {
  return `test_answer_draft_${slug}_${attemptId}`;
}

/**
 * @param {string} slug
 * @param {number|string|null|undefined} attemptId
 * @returns {Record<string, string>}
 */
export function loadAnswerDraft(slug, attemptId) {
  if (!slug || attemptId == null || attemptId === '') return {};
  try {
    const raw = JSON.parse(sessionStorage.getItem(storageKey(slug, attemptId)) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value == null || value === '') continue;
      out[String(key)] = String(value);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {string} slug
 * @param {number|string|null|undefined} attemptId
 * @param {Record<string, string|null|undefined>} answers
 */
export function saveAnswerDraft(slug, attemptId, answers) {
  if (!slug || attemptId == null || attemptId === '') return;
  try {
    const safe = {};
    for (const [key, value] of Object.entries(answers || {})) {
      if (value == null || value === '') continue;
      safe[String(key)] = String(value);
    }
    sessionStorage.setItem(storageKey(slug, attemptId), JSON.stringify(safe));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {string} slug
 * @param {number|string|null|undefined} attemptId
 */
export function clearAnswerDraft(slug, attemptId) {
  if (!slug || attemptId == null || attemptId === '') return;
  try {
    sessionStorage.removeItem(storageKey(slug, attemptId));
  } catch {
    /* ignore */
  }
}

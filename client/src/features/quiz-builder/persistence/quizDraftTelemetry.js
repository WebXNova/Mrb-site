const LOG_PREFIX = '[quiz-draft-sync]';

/**
 * @param {string} event
 * @param {Record<string, unknown>} [payload]
 */
export function logQuizDraftSync(event, payload = {}) {
  if (typeof console === 'undefined') return;
  const entry = { event, ...payload, ts: new Date().toISOString() };
  if (event.startsWith('.error') || event.endsWith('.failure') || event.startsWith('recovery.error')) {
    console.warn(LOG_PREFIX, entry);
    return;
  }
  console.info(LOG_PREFIX, entry);
}

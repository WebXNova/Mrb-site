/** @typedef {'submitted' | 'auto_submitted' | 'expired' | 'admin_closed'} CompletionReason */

/** @type {readonly CompletionReason[]} */
export const COMPLETION_REASONS = Object.freeze([
  'submitted',
  'auto_submitted',
  'expired',
  'admin_closed',
]);

/**
 * @param {unknown} value
 * @returns {value is CompletionReason}
 */
export function isCompletionReason(value) {
  return typeof value === 'string' && COMPLETION_REASONS.includes(/** @type {CompletionReason} */ (value));
}

/** Fixed MCQ option keys — Phase 1 single-choice only. */
export const OPTION_KEYS = Object.freeze(['A', 'B', 'C', 'D']);

/**
 * @param {string} key
 * @returns {key is 'A' | 'B' | 'C' | 'D'}
 */
export function isOptionKey(key) {
  return OPTION_KEYS.includes(String(key));
}

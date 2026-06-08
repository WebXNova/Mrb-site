import { validateOptionImageUrl } from '../image/validateOptionImageUrl.js';
import { createDefaultOptions } from '../../state/initialState.js';
import { isOptionKey, OPTION_KEYS } from './optionKeys.js';
import { sanitizeOptionText } from './sanitizeOptionText.js';

/**
 * MCQ correctness enforcement — deterministic, UI-untrusted.
 * UI is not the source of truth; backend re-validates on submit.
 *
 * @typedef {import('../../types/createQuestion.types.js').McqOptionsMap} McqOptionsMap
 * @typedef {import('../../types/createQuestion.types.js').McqOptionValue} McqOptionValue
 */

/**
 * @param {unknown} options
 * @returns {McqOptionsMap}
 */
function defaultOptionSkeleton() {
  return createDefaultOptions();
}

/**
 * Ensures all four keys exist with valid shape.
 *
 * @param {unknown} options
 * @returns {McqOptionsMap}
 */
export function ensureOptionsShape(options) {
  const defaults = defaultOptionSkeleton();
  const source = typeof options === 'object' && options !== null ? options : {};

  return OPTION_KEYS.reduce((acc, key) => {
    const raw = /** @type {Record<string, McqOptionValue>} */ (source)[key];
    acc[key] = {
      text: String(raw?.text ?? defaults[key].text),
      image_url: String(raw?.image_url ?? defaults[key].image_url),
      is_correct: Boolean(raw?.is_correct),
    };
    return acc;
  }, /** @type {McqOptionsMap} */ ({}));
}

/**
 * State correction safety layer — never allow 0 or 2+ correct flags.
 * Deterministic resolution:
 *   - 0 correct → A becomes correct
 *   - 2+ correct → first key in A→D order among true wins
 *
 * @param {unknown} options
 * @returns {McqOptionsMap}
 */
export function coerceOptionsIntegrity(options) {
  const shaped = ensureOptionsShape(options);
  const correctKeys = OPTION_KEYS.filter((key) => shaped[key].is_correct);

  let winner = 'A';
  if (correctKeys.length === 1) {
    winner = correctKeys[0];
  } else if (correctKeys.length > 1) {
    winner = correctKeys[0];
  }

  return OPTION_KEYS.reduce((acc, key) => {
    acc[key] = {
      ...shaped[key],
      is_correct: key === winner,
    };
    return acc;
  }, /** @type {McqOptionsMap} */ ({}));
}

/**
 * Set exactly one correct answer. All others become false.
 *
 * @param {McqOptionsMap} options
 * @param {string} optionKey
 * @returns {McqOptionsMap}
 */
export function setCorrectAnswer(options, optionKey) {
  if (!isOptionKey(optionKey)) {
    return coerceOptionsIntegrity(options);
  }

  const shaped = ensureOptionsShape(options);

  return OPTION_KEYS.reduce((acc, key) => {
    acc[key] = {
      ...shaped[key],
      is_correct: key === optionKey,
    };
    return acc;
  }, /** @type {McqOptionsMap} */ ({}));
}

/**
 * @param {McqOptionsMap} options
 * @returns {string|null}
 */
export function getCorrectAnswerKey(options) {
  const coerced = coerceOptionsIntegrity(options);
  return OPTION_KEYS.find((key) => coerced[key].is_correct) ?? null;
}

/**
 * @param {McqOptionsMap} options
 * @returns {boolean}
 */
export function hasExactlyOneCorrectAnswer(options) {
  const coerced = coerceOptionsIntegrity(options);
  const count = OPTION_KEYS.filter((key) => coerced[key].is_correct).length;
  return count === 1;
}

/**
 * Pre-submit validation. Always runs integrity coercion first.
 *
 * @param {unknown} options
 * @param {{ requireNonEmptyText?: boolean }} [config]
 * @returns {{
 *   ok: true,
 *   options: McqOptionsMap,
 *   correctKey: string,
 * } | {
 *   ok: false,
 *   options: McqOptionsMap,
 *   errors: Array<{ code: string, message: string, optionKey?: string }>,
 * }}
 */
export function validateOptionsBeforeSubmit(options, { requireNonEmptyText = true } = {}) {
  const coerced = coerceOptionsIntegrity(options);
  const errors = [];

  for (const key of OPTION_KEYS) {
    if (!coerced[key]) {
      errors.push({
        code: 'OPTION_MISSING',
        message: `Option ${key} is missing.`,
        optionKey: key,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, options: coerced, errors };
  }

  const correctKey = getCorrectAnswerKey(coerced);
  if (!correctKey) {
    errors.push({
      code: 'NO_CORRECT_OPTION',
      message: 'Exactly one option must be marked as correct.',
    });
  }

  if (requireNonEmptyText) {
    for (const key of OPTION_KEYS) {
      const text = sanitizeOptionText(coerced[key].text).trim();
      if (!text) {
        errors.push({
          code: 'OPTION_TEXT_EMPTY',
          message: `Option ${key} text is required.`,
          optionKey: key,
        });
      }
    }
  }

  for (const key of OPTION_KEYS) {
    const imageUrl = coerced[key].image_url?.trim();
    if (!imageUrl) continue;
    const check = validateOptionImageUrl(imageUrl);
    if (!check.ok) {
      errors.push({
        code: 'OPTION_IMAGE_INVALID',
        message: check.message,
        optionKey: key,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, options: coerced, errors };
  }

  return { ok: true, options: coerced, correctKey: correctKey ?? 'A' };
}

/**
 * Normalize A–D map into ordered API array (single correct flag guaranteed).
 *
 * @param {unknown} options
 * @returns {Array<{
 *   key: string,
 *   text: string,
 *   image_url: string | null,
 *   is_correct: boolean,
 * }>}
 */
export function normalizeOptionsForAPI(options) {
  const coerced = coerceOptionsIntegrity(options);

  return OPTION_KEYS.map((key, index) => {
    const opt = coerced[key];
    let imageUrl = null;
    if (opt.image_url?.trim()) {
      const check = validateOptionImageUrl(opt.image_url);
      imageUrl = check.ok ? check.url : null;
    }

    return {
      key,
      text: sanitizeOptionText(opt.text),
      image_url: imageUrl,
      is_correct: Boolean(opt.is_correct),
      sort_order: index,
    };
  });
}

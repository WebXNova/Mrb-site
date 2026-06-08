import { ApiError } from '../utils/apiError.js';

/**
 * MCQ option keys — fixed A–D model (Phase 1).
 * Frontend correctness is not trusted; this module is the server-side source of truth.
 */
export const MCQ_OPTION_KEYS = Object.freeze(['A', 'B', 'C', 'D']);

const KEY_TO_SORT_ORDER = Object.freeze({ A: 0, B: 1, C: 2, D: 3 });

function invalidOptions(message, code) {
  return new ApiError(422, message, { code });
}

/**
 * Normalize a single option from API payload (snake_case, camelCase, or frontend `key`).
 * @param {unknown} raw
 * @param {number} index
 */
function normalizeOptionInput(raw, index) {
  if (typeof raw !== 'object' || raw === null) {
    throw invalidOptions(`Option at index ${index} must be an object`, 'INVALID_OPTION_SHAPE');
  }

  const optionKey = String(raw.option_key ?? raw.key ?? '').trim().toUpperCase();
  const optionText = String(raw.option_text ?? raw.text ?? '').trim();
  const imageUrl = raw.image_url ?? raw.imageUrl ?? null;
  const isCorrect = Boolean(raw.is_correct ?? raw.isCorrect);
  const sortOrderRaw = raw.sort_order ?? raw.sortOrder;

  return {
    option_key: optionKey,
    option_text: optionText,
    image_url: imageUrl == null || String(imageUrl).trim() === '' ? null : String(imageUrl).trim(),
    is_correct: isCorrect,
    sort_order:
      sortOrderRaw != null && Number.isFinite(Number(sortOrderRaw))
        ? Number(sortOrderRaw)
        : KEY_TO_SORT_ORDER[optionKey] ?? index,
  };
}

/**
 * Validate MCQ options before persistence.
 *
 * Rules:
 * - length must be exactly 4
 * - keys must be A, B, C, D (unique, one each)
 * - exactly one is_correct === true
 * - each option_text non-empty
 *
 * @param {unknown} options
 * @returns {Array<{
 *   option_key: string,
 *   option_text: string,
 *   image_url: string|null,
 *   is_correct: boolean,
 *   sort_order: number,
 * }>}
 */
export function validateOptions(options) {
  if (!Array.isArray(options)) {
    throw invalidOptions('options must be an array', 'OPTIONS_NOT_ARRAY');
  }

  if (options.length !== MCQ_OPTION_KEYS.length) {
    throw invalidOptions(
      `Exactly ${MCQ_OPTION_KEYS.length} options (A–D) are required`,
      'INVALID_OPTION_COUNT'
    );
  }

  const normalized = options.map((opt, index) => normalizeOptionInput(opt, index));

  const keysPresent = normalized.map((opt) => opt.option_key);
  const allKeysEmpty = normalized.every((opt) => !opt.option_key);
  const hasAllKeys = normalized.every((opt) => MCQ_OPTION_KEYS.includes(opt.option_key));

  if (allKeysEmpty) {
    const positional = normalized.map((opt, index) => ({
      ...opt,
      option_key: MCQ_OPTION_KEYS[index],
    }));
    return finalizeValidatedOptions(positional);
  }

  if (!hasAllKeys || new Set(keysPresent).size !== MCQ_OPTION_KEYS.length) {
    throw invalidOptions('Options must include exactly one entry for each key A, B, C, and D', 'INVALID_OPTION_KEYS');
  }

  return finalizeValidatedOptions(normalized);
}

/**
 * @param {Array<{ option_key: string, option_text: string, image_url: string|null, is_correct: boolean, sort_order: number }>} normalized
 */
function finalizeValidatedOptions(normalized) {
  for (const opt of normalized) {
    if (!opt.option_text) {
      throw invalidOptions(`Option ${opt.option_key} must have non-empty option_text`, 'INVALID_OPTION_TEXT');
    }
  }

  const correctCount = normalized.filter((opt) => opt.is_correct).length;
  if (correctCount === 0) {
    throw invalidOptions('Exactly one option must be marked as correct', 'NO_CORRECT_OPTION');
  }
  if (correctCount > 1) {
    throw invalidOptions('Only one option may be marked as correct', 'MULTIPLE_CORRECT_OPTIONS');
  }

  return MCQ_OPTION_KEYS.map((key) => {
    const row = normalized.find((opt) => opt.option_key === key);
    if (!row) {
      throw invalidOptions(`Missing option key ${key}`, 'MISSING_OPTION_KEY');
    }
    return {
      option_key: key,
      option_text: row.option_text,
      image_url: row.image_url,
      is_correct: row.is_correct,
      sort_order: KEY_TO_SORT_ORDER[key],
    };
  });
}

/**
 * Alias used by service layer before DB insert.
 * @param {unknown} options
 */
export function normalizeMcqOptionsForInsert(options) {
  return validateOptions(options);
}

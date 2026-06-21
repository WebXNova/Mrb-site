/**
 * Single authority for question mark values — server-side only.
 * Used by question write, import pipelines, and quiz draft materialization.
 */

export const DEFAULT_QUESTION_MARKS = 1;
export const MIN_QUESTION_MARKS = 0.01;
export const MAX_QUESTION_MARKS = 999_999.99;

/**
 * Round to two decimal places (matches DECIMAL(8,2)).
 * @param {number} value
 * @returns {number}
 */
export function roundQuestionMarks(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * @param {unknown} raw
 * @param {{ defaultWhenMissing?: boolean, field?: string }} [options]
 * @returns {{ ok: true, marks: number } | { ok: false, message: string }}
 */
export function validateQuestionMarks(raw, options = {}) {
  const field = options.field ?? 'marks';
  const useDefault = options.defaultWhenMissing !== false;

  if (raw == null || raw === '') {
    if (useDefault) {
      return { ok: true, marks: DEFAULT_QUESTION_MARKS };
    }
    return { ok: false, message: `${field} is required` };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `${field} must be a valid number` };
  }

  if (value <= 0) {
    return { ok: false, message: `${field} must be greater than 0` };
  }

  if (value < MIN_QUESTION_MARKS) {
    return { ok: false, message: `${field} must be at least ${MIN_QUESTION_MARKS}` };
  }

  if (value > MAX_QUESTION_MARKS) {
    return { ok: false, message: `${field} must not exceed ${MAX_QUESTION_MARKS}` };
  }

  const rounded = roundQuestionMarks(value);
  if (Math.abs(value - rounded) > 1e-9) {
    return { ok: false, message: `${field} must have at most 2 decimal places` };
  }

  return { ok: true, marks: rounded };
}

/**
 * @param {unknown} raw
 * @param {{ defaultWhenMissing?: boolean, field?: string }} [options]
 * @returns {number}
 */
export function normalizeQuestionMarks(raw, options = {}) {
  const result = validateQuestionMarks(raw, options);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.marks;
}

/**
 * @param {unknown} raw
 * @param {{ field?: string }} [options]
 * @returns {{ ok: true, marks: number } | { ok: false, message: string }}
 */
export function validatePassingMarks(raw, options = {}) {
  const field = options.field ?? 'passing_marks';

  if (raw == null || raw === '') {
    return { ok: false, message: `${field} is required` };
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { ok: false, message: `${field} must be a valid number` };
  }

  if (value < 0) {
    return { ok: false, message: `${field} must be 0 or greater` };
  }

  const rounded = roundQuestionMarks(value);
  if (Math.abs(value - rounded) > 1e-9) {
    return { ok: false, message: `${field} must have at most 2 decimal places` };
  }

  return { ok: true, marks: rounded };
}

/**
 * @param {unknown} raw
 * @returns {number}
 */
export function assertPassingMarks(raw) {
  const result = validatePassingMarks(raw);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.marks;
}

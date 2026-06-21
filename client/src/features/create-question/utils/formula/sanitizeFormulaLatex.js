import { FORMULA_CLOSE, FORMULA_OPEN } from './formulaDelimiters.js';

const MAX_FORMULA_LENGTH = 500;
const UNSAFE_FORMULA_PATTERN = /[<>"'`\\]|javascript:|data:/i;

/**
 * Sanitize LaTeX / formula input before insertion into editor.
 *
 * @param {string} raw
 * @returns {{ ok: true, latex: string } | { ok: false, message: string }}
 */
export function sanitizeFormulaLatex(raw) {
  const trimmed = String(raw ?? '').trim();

  if (!trimmed) {
    return { ok: false, message: 'Formula cannot be empty.' };
  }

  if (trimmed.length > MAX_FORMULA_LENGTH) {
    return { ok: false, message: `Formula must not exceed ${MAX_FORMULA_LENGTH} characters.` };
  }

  if (UNSAFE_FORMULA_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Formula contains disallowed characters.' };
  }

  if (trimmed.includes(FORMULA_OPEN) || trimmed.includes(FORMULA_CLOSE)) {
    return { ok: false, message: 'Formula cannot contain formula delimiters.' };
  }

  return { ok: true, latex: trimmed };
}

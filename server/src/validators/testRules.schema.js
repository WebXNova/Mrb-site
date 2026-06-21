import { z } from 'zod';
import { PUBLISHED_EDIT_CONTROL_KEYS } from '../services/publishedTestEdit.service.js';

export const TEST_RULES_ALLOWED_KEYS = Object.freeze([
  'duration_minutes',
  'max_attempts',
  'passing_marks',
  'negative_marking',
  ...PUBLISHED_EDIT_CONTROL_KEYS,
]);

export const parsePositiveTestIdParam = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: 'INVALID_TEST_ID' } };
  }
  return { ok: true, id };
};

/**
 * Step 2 — strict whitelist. Rejects unknown fields (no mass assignment).
 * passing_percentage and total_marks are never accepted.
 */
export const testRulesBodySchema = z
  .object({
    duration_minutes: z.coerce.number().int().min(1).max(600),
    max_attempts: z.coerce.number().int().min(1).max(50),
    passing_marks: z.coerce.number().min(0),
    negative_marking: z.coerce.number().min(0).max(1).optional(),
  })
  .strict();

/**
 * @param {unknown} body
 */
export function assertTestRulesWhitelist(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const forbiddenKeys = ['passing_percentage', 'total_marks', 'totalMarks', 'passingPercentage'];
  const forbiddenPresent = Object.keys(body).filter((key) => forbiddenKeys.includes(key));
  if (forbiddenPresent.length) {
    return {
      ok: false,
      error: `These fields are not allowed: ${forbiddenPresent.join(', ')}`,
      unknownKeys: forbiddenPresent,
    };
  }

  const unknownKeys = Object.keys(body).filter((key) => !TEST_RULES_ALLOWED_KEYS.includes(key));
  if (unknownKeys.length) {
    return {
      ok: false,
      error: `Unknown fields are not allowed: ${unknownKeys.join(', ')}`,
      unknownKeys,
    };
  }

  return { ok: true };
}

import { z } from 'zod';

export const TEST_RULES_ALLOWED_KEYS = Object.freeze([
  'duration_minutes',
  'max_attempts',
  'passing_percentage',
  'passing_marks',
  'negative_marking',
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
 */
export const testRulesBodySchema = z
  .object({
    duration_minutes: z.coerce.number().int().min(1).max(600),
    max_attempts: z.coerce.number().int().min(1).max(50),
    passing_percentage: z.coerce.number().min(0).max(100).optional(),
    passing_marks: z.coerce.number().min(0).optional().nullable(),
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

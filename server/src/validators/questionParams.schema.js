import { z } from 'zod';

/**
 * Route param `:id` for /api/questions/:id
 * Rejects malformed values (abc, 12.5, -1, 0, empty, whitespace).
 */
export const questionIdParamSchema = z.object({
  id: z
    .string({ required_error: 'id is required' })
    .trim()
    .min(1, 'id is required')
    .regex(/^[1-9]\d*$/, 'id must be a positive integer')
    .transform((value) => Number(value)),
});

/**
 * @param {{ id?: string }} params
 * @returns {number}
 */
export function parseQuestionIdParam(params) {
  const parsed = questionIdParamSchema.safeParse(params);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten() };
  }
  return { ok: true, id: parsed.data.id };
}

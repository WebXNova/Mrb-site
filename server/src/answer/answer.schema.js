import { z } from 'zod';

/**
 * Strict request body — rejects unknown fields (mass-assignment safe).
 */
export const saveAnswerBodySchema = z
  .object({
    question_id: z.coerce.number().int().positive(),
    selected_option_id: z.coerce.number().int().positive(),
  })
  .strict();

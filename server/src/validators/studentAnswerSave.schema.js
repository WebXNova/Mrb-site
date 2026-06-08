import { z } from 'zod';

export const saveStudentAnswerBodySchema = z
  .object({
    questionId: z.coerce.number().int().positive(),
    selectedOptionId: z.coerce.number().int().positive(),
  })
  .strict();

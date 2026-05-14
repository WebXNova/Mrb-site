import { z } from 'zod';

/** Hard cap to prevent oversized payloads being used to lock many rows. */
const MAX_SUBJECTS_PER_COURSE = 500;

export const subjectReorderBodySchema = z
  .object({
    orderedSubjectIds: z
      .array(z.number().int().positive())
      .min(1)
      .max(MAX_SUBJECTS_PER_COURSE)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'orderedSubjectIds must not contain duplicates',
      }),
  })
  .strict();

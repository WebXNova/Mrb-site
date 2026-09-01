import { z } from 'zod';

export const courseMarkFinishedBodySchema = z
  .object({
    confirm: z.boolean().refine((v) => v === true, { message: 'confirm must be true' }),
  })
  .strict();

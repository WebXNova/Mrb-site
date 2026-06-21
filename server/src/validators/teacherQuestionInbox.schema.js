import { z } from 'zod';

export const DEFAULT_INBOX_PAGE = 1;
export const DEFAULT_INBOX_LIMIT = 20;
export const MAX_INBOX_LIMIT = 50;

const inboxStatusSchema = z.enum(['all', 'sent', 'seen', 'answered']);

export const teacherQuestionInboxQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(DEFAULT_INBOX_PAGE),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_INBOX_LIMIT, `limit must not exceed ${MAX_INBOX_LIMIT}`)
      .optional()
      .default(DEFAULT_INBOX_LIMIT),
    status: inboxStatusSchema.optional().default('all'),
    search: z.string().trim().max(200).optional().default(''),
    pinned_only: z
      .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.boolean()])
      .optional()
      .transform((v) => v === true || v === 'true' || v === '1')
      .default(false),
  })
  .strict();

export const teacherQuestionPinBodySchema = z
  .object({
    pinned: z.boolean(),
  })
  .strict();

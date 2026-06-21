import { z } from 'zod';

export const MAX_BULK_QUESTION_IDS = 100;

const questionIdsSchema = z
  .array(z.coerce.number({ invalid_type_error: 'question_ids must be numbers' }).int().positive())
  .min(1, 'question_ids must contain at least one id')
  .max(MAX_BULK_QUESTION_IDS, `question_ids must not exceed ${MAX_BULK_QUESTION_IDS} items`);

export const questionBulkDeleteBodySchema = z
  .object({
    question_ids: questionIdsSchema,
  })
  .strict();

export const questionBulkExportBodySchema = z
  .object({
    question_ids: questionIdsSchema,
    format: z.enum(['aiken']).optional().default('aiken'),
  })
  .strict();

export const questionBulkAssignTestBodySchema = z
  .object({
    question_ids: questionIdsSchema,
    test_id: z.coerce.number({ invalid_type_error: 'test_id must be a number' }).int().positive(),
  })
  .strict();

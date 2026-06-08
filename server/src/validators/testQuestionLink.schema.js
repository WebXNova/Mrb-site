import { z } from 'zod';
import { questionListQuerySchema } from './questionList.schema.js';

export const parsePositiveTestId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: 'INVALID_TEST_ID' } };
  }
  return { ok: true, id };
};

export const parsePositiveQuestionIdParam = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: { code: 'INVALID_QUESTION_ID' } };
  }
  return { ok: true, id };
};

export const linkQuestionToTestBodySchema = z
  .object({
    questionId: z.coerce.number().int().positive(),
    displayOrder: z.coerce.number().int().min(0).max(1_000_000).optional(),
    marksOverride: z.coerce.number().min(0).max(1000).nullable().optional(),
  })
  .strict();

export const reorderTestQuestionsBodySchema = z
  .array(
    z
      .object({
        questionId: z.coerce.number().int().positive(),
        displayOrder: z.coerce.number().int().min(0).max(1_000_000),
      })
      .strict()
  )
  .min(1, 'At least one question reorder entry is required')
  .max(500, 'Too many reorder entries');

/** Available picker — inherits list pagination/search/filter rules. */
export const availableTestQuestionsQuerySchema = questionListQuerySchema;

export const BULK_LINK_MAX_QUESTION_IDS = 100;
export const MAX_QUESTIONS_PER_TEST = 200;

export const BULK_LINK_ALLOWED_KEYS = Object.freeze(['question_ids']);

export const bulkLinkQuestionsBodySchema = z
  .object({
    question_ids: z
      .array(z.coerce.number().int().positive())
      .min(1, 'At least one question id is required')
      .max(BULK_LINK_MAX_QUESTION_IDS, `Cannot link more than ${BULK_LINK_MAX_QUESTION_IDS} questions per request`),
  })
  .strict();

export const bulkUnlinkQuestionsBodySchema = z
  .object({
    question_ids: z
      .array(z.coerce.number().int().positive())
      .min(1, 'At least one question id is required')
      .max(BULK_LINK_MAX_QUESTION_IDS, `Cannot unlink more than ${BULK_LINK_MAX_QUESTION_IDS} questions per request`),
  })
  .strict();

/**
 * @param {unknown} body
 */
export function assertBulkLinkWhitelist(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const unknownKeys = Object.keys(body).filter((key) => !BULK_LINK_ALLOWED_KEYS.includes(key));
  if (unknownKeys.length) {
    return {
      ok: false,
      error: `Unknown fields are not allowed: ${unknownKeys.join(', ')}`,
      unknownKeys,
    };
  }

  return { ok: true };
}

/**
 * @param {unknown} body
 */
export function assertBulkUnlinkWhitelist(body) {
  return assertBulkLinkWhitelist(body);
}

import { z } from 'zod';

export const DEFAULT_STUDENT_TEST_PAGE = 1;
export const DEFAULT_STUDENT_TEST_LIMIT = 20;
export const MAX_STUDENT_TEST_LIMIT = 50;

export const studentTestListQuerySchema = z
  .object({
    page: z.coerce
      .number({ invalid_type_error: 'page must be an integer' })
      .int()
      .min(1, 'page must be at least 1')
      .optional()
      .default(DEFAULT_STUDENT_TEST_PAGE),
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be an integer' })
      .int()
      .min(1, 'limit must be at least 1')
      .max(MAX_STUDENT_TEST_LIMIT, `limit must not exceed ${MAX_STUDENT_TEST_LIMIT}`)
      .optional()
      .default(DEFAULT_STUDENT_TEST_LIMIT),
  })
  .strict();

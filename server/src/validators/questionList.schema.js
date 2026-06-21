import { z } from 'zod';

export const QUESTION_DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);

export const QUESTION_DIFFICULTY_MESSAGE = 'difficulty must be easy, medium, or hard';

/** Optional/nullable difficulty for write APIs — empty string normalizes to null. */
export const optionalQuestionDifficultySchema = z.preprocess(
  (value) => (value == null || String(value).trim() === '' ? null : String(value).trim()),
  z
    .enum(QUESTION_DIFFICULTIES, {
      errorMap: () => ({ message: QUESTION_DIFFICULTY_MESSAGE }),
    })
    .nullable()
    .optional()
);

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 200;

function preprocessListQuery(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};

  if (obj.courseId != null && obj.course_id == null) obj.course_id = obj.courseId;
  if (obj.subjectId != null && obj.subject_id == null) obj.subject_id = obj.subjectId;

  delete obj.courseId;
  delete obj.subjectId;

  for (const key of Object.keys(obj)) {
    if (obj[key] === '' || obj[key] == null) {
      delete obj[key];
    }
  }

  return obj;
}

const optionalPositiveInt = z.preprocess(
  (value) => (value === undefined || value === null || value === '' ? undefined : value),
  z.coerce.number({ invalid_type_error: 'must be a positive integer' }).int().positive().optional()
);

export const questionListQuerySchema = z.preprocess(
  preprocessListQuery,
  z
    .object({
      page: z.coerce
        .number({ invalid_type_error: 'page must be an integer' })
        .int()
        .min(1, 'page must be at least 1')
        .optional()
        .default(DEFAULT_PAGE),
      limit: z.coerce
        .number({ invalid_type_error: 'limit must be an integer' })
        .int()
        .min(1, 'limit must be at least 1')
        .max(MAX_LIMIT, `limit must not exceed ${MAX_LIMIT}`)
        .optional()
        .default(DEFAULT_LIMIT),
      difficulty: z.enum(QUESTION_DIFFICULTIES, {
        errorMap: () => ({ message: QUESTION_DIFFICULTY_MESSAGE }),
      }).optional(),
      search: z
        .string()
        .trim()
        .min(1, 'search must not be empty when provided')
        .max(MAX_SEARCH_LENGTH, `search must not exceed ${MAX_SEARCH_LENGTH} characters`)
        .optional(),
      topic: z
        .string()
        .trim()
        .min(1, 'topic must not be empty when provided')
        .max(MAX_SEARCH_LENGTH, `topic must not exceed ${MAX_SEARCH_LENGTH} characters`)
        .optional(),
      course_id: optionalPositiveInt,
      subject_id: optionalPositiveInt,
    })
    .strict()
);

export { DEFAULT_PAGE, DEFAULT_LIMIT, MAX_LIMIT };

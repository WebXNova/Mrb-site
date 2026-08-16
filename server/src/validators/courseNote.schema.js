import { z } from 'zod';

const optionalPositiveInt = z.preprocess(
  (value) => {
    if (value == null || value === '' || value === 'null' || value === 'undefined') return null;
    return value;
  },
  z.union([z.null(), z.coerce.number().int().positive()])
);

export const createCourseNoteFieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z
    .string()
    .trim()
    .max(8000)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
  subject_id: optionalPositiveInt,
  chapter_id: optionalPositiveInt,
  lecture_id: optionalPositiveInt,
});

export const updateCourseNoteBodySchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z
    .string()
    .trim()
    .max(8000)
    .optional()
    .nullable()
    .transform((v) => (v == null || v === '' ? null : v)),
});

export const listCourseNotesQuerySchema = z.object({
  subject_id: optionalPositiveInt,
  chapter_id: optionalPositiveInt,
  lecture_id: optionalPositiveInt,
});

/**
 * @param {Record<string, unknown>} body
 */
export function parseCreateCourseNoteFields(body) {
  return createCourseNoteFieldsSchema.parse(body ?? {});
}

/**
 * @param {Record<string, unknown>} body
 */
export function parseUpdateCourseNoteBody(body) {
  return updateCourseNoteBodySchema.parse(body ?? {});
}

/**
 * @param {Record<string, unknown>} query
 */
export function parseListCourseNotesQuery(query) {
  return listCourseNotesQuerySchema.parse(query ?? {});
}

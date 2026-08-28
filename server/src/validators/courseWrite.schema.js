import { z } from 'zod';
import { coursePricingWriteBodySchema } from './coursePricing.schema.js';
import { subjectSeedForCourseCreateSchema } from './subjectWrite.schema.js';
import { ADMISSION_STATUS, COURSE_STATUS_VALUES, normalizeDateOnly, validateCourseDateRange } from '../models/course.model.js';

const dateOnlyField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => normalizeDateOnly(v))
  .pipe(z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional());

function preprocessCourseBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.thumbnail_url == null && obj.coverImage != null) obj.thumbnail_url = obj.coverImage;
  if (obj.thumbnail_url == null && obj.thumbnail != null) obj.thumbnail_url = obj.thumbnail;
  if (obj.is_active == null && obj.isActive != null) obj.is_active = obj.isActive;
  delete obj.coverImage;
  delete obj.thumbnail;
  delete obj.isActive;
  delete obj.schemaVersion;
  return obj;
}

const shortDescriptionSchema = z
  .string()
  .max(512)
  .optional()
  .nullable()
  .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()));

const courseMutableFields = z.object({
  title: z.string().min(2).max(180),
  description: z.string().min(10),
  short_description: shortDescriptionSchema,
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  thumbnail_url: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  status: z.enum(COURSE_STATUS_VALUES).optional(),
  start_date: dateOnlyField,
  end_date: dateOnlyField,
  admission_status: z.enum([ADMISSION_STATUS.OPEN, ADMISSION_STATUS.CLOSED]).optional(),
});

function admissionDateRefine(data, ctx) {
  const check = validateCourseDateRange(data.start_date ?? null, data.end_date ?? null);
  if (!check.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: check.message,
      path: ['end_date'],
    });
  }
}

/**
 * Batch & rules → "Save admission status" sends only this field.
 * Must not require title/description/level/dates (those belong on General).
 */
export const courseAdmissionOnlyWriteSchema = z
  .object({
    admission_status: z.enum([ADMISSION_STATUS.OPEN, ADMISSION_STATUS.CLOSED]),
  })
  .strict();

/**
 * General-tab identity write. start_date/end_date are optional (removed from UI).
 * title, description, and level remain required.
 */
export const courseIdentityWriteSchema = courseMutableFields
  .strip()
  .superRefine(admissionDateRefine);

/**
 * PUT /admin/courses/:id — admission-only patch OR full identity update.
 * Pricing is `/admin/courses/:id/pricing`.
 */
export const courseWriteBodySchema = z.preprocess(
  preprocessCourseBody,
  z.union([courseAdmissionOnlyWriteSchema, courseIdentityWriteSchema])
);

/**
 * Allowed fields for `POST /admin/courses`. Course identity + optional initial
 * `pricing` + **required** `subjects` (at least one row) so the catalog row is
 * never created without its first curriculum slice and pricing in one
 * transactional submit.
 */
export const courseCreateBodySchema = z.preprocess(
  preprocessCourseBody,
  courseMutableFields
    .extend({
      status: z.enum(COURSE_STATUS_VALUES).optional().default('draft'),
      pricing: coursePricingWriteBodySchema.optional().nullable(),
      subjects: z.array(subjectSeedForCourseCreateSchema).min(1).max(200),
    })
    .strip()
    .superRefine(admissionDateRefine)
);

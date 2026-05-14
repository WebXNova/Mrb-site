import { z } from 'zod';
import { coursePricingWriteBodySchema } from './coursePricing.schema.js';
import { subjectSeedForCourseCreateSchema } from './subjectWrite.schema.js';

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

const courseBaseObject = z.object({
  title: z.string().min(2).max(180),
  description: z.string().min(10),
  short_description: shortDescriptionSchema,
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  thumbnail_url: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
});

/**
 * Allowed fields for `PUT /admin/courses/:id`. Course identity only — pricing
 * is updated via the dedicated `/admin/courses/:id/pricing` endpoint.
 */
export const courseWriteBodySchema = z.preprocess(
  preprocessCourseBody,
  courseBaseObject.strip()
);

/**
 * Allowed fields for `POST /admin/courses`. Course identity + optional initial
 * `pricing` + **required** `subjects` (at least one row) so the catalog row is
 * never created without its first curriculum slice and pricing in one
 * transactional submit.
 */
export const courseCreateBodySchema = z.preprocess(
  preprocessCourseBody,
  courseBaseObject
    .extend({
      pricing: coursePricingWriteBodySchema.optional().nullable(),
      subjects: z.array(subjectSeedForCourseCreateSchema).min(1).max(200),
    })
    .strip()
);

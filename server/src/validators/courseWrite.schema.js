import { z } from 'zod';

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

/**
 * Allowed fields for POST/PUT `/admin/courses`.
 */
export const courseWriteBodySchema = z.preprocess(
  preprocessCourseBody,
  z
    .object({
      title: z.string().min(2).max(180),
      description: z.string().min(10),
      short_description: shortDescriptionSchema,
      level: z.enum(['beginner', 'intermediate', 'advanced']),
      thumbnail_url: z.string().max(1000).optional().nullable(),
      is_active: z.boolean().optional(),
    })
    .strip()
);

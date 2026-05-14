import { z } from 'zod';

function preprocessSubjectBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.order_index != null && obj.orderIndex == null) obj.orderIndex = obj.order_index;
  if (obj.is_active != null && obj.isActive == null) obj.isActive = obj.is_active;
  delete obj.order_index;
  delete obj.is_active;
  return obj;
}

const descriptionSchema = z
  .string()
  .max(8000)
  .optional()
  .nullable()
  .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()));

/**
 * Minimal subject row embedded in `POST /admin/courses` (course + pricing +
 * initial curriculum in one transaction). Order is assigned server-side by
 * array index.
 */
export const subjectSeedForCourseCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: descriptionSchema,
});

export const subjectCreateBodySchema = z.preprocess(
  preprocessSubjectBody,
  z
    .object({
      title: z.string().trim().min(1).max(180),
      description: descriptionSchema,
      orderIndex: z.number().int().min(0).max(1_000_000).optional(),
    })
    .strict()
);

export const subjectUpdateBodySchema = z.preprocess(
  preprocessSubjectBody,
  z
    .object({
      title: z.string().trim().min(1).max(180).optional(),
      description: descriptionSchema,
      orderIndex: z.number().int().min(0).max(1_000_000).optional(),
      isActive: z.boolean().optional(),
      // Optional optimistic-concurrency guard: ISO-8601 timestamp the client last saw.
      expectedUpdatedAt: z
        .string()
        .trim()
        .min(1)
        .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'expectedUpdatedAt must be ISO-8601' })
        .optional(),
    })
    .strict()
);

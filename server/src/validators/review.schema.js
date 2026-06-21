import { z } from 'zod';
import { isValidPkMobile } from '../utils/phoneValidation.js';

const reviewStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']);

export const adminReviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(120).optional(),
  status: reviewStatusEnum.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  published: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  dateFrom: z.string().max(32).optional(),
  dateTo: z.string().max(32).optional(),
});

export const adminReviewUpdateSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  phone: z
    .string()
    .max(20)
    .refine((v) => isValidPkMobile(v), { message: 'Invalid mobile number' })
    .optional(),
  email: z.string().email().max(255).nullable().optional(),
  courseName: z.string().max(200).nullable().optional(),
  rating: z.number().int().min(1).max(5).optional(),
  reviewMessage: z.string().min(20).max(5000).optional(),
  adminNotes: z.string().max(5000).nullable().optional(),
});

export const adminReviewFeatureSchema = z.object({
  featured: z.boolean(),
});

export const adminReviewBulkSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1).max(100),
  action: z.enum(['approve', 'reject', 'publish', 'archive', 'delete']),
});

export const adminReviewNotesSchema = z.object({
  adminNotes: z.string().max(5000).nullable(),
});

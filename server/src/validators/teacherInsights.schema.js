import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const teacherInsightsDashboardQuerySchema = z.object({
  teacherId: z.coerce.number().int().positive().optional(),
});

export const teacherInsightsActivityFeedQuerySchema = paginationSchema.extend({
  teacherId: z.coerce.number().int().positive().optional(),
});

export const teacherInsightsTeacherIdParamSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
});

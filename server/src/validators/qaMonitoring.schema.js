import { z } from 'zod';
import { TEACHER_ACTIVITY_ACTIONS } from '../constants/teacherActivity.schema.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const dateFilterSchema = z.object({
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateFrom must be YYYY-MM-DD')
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateTo must be YYYY-MM-DD')
    .optional(),
});

const statusSchema = z
  .enum(['pending', 'answered', 'PENDING', 'ANSWERED', 'all', ''])
  .optional()
  .transform((v) => {
    if (!v || v === 'all' || v === '') return undefined;
    return String(v).toLowerCase();
  });

export const qaMonitoringQuestionsQuerySchema = paginationSchema
  .extend({
    status: statusSchema,
    teacherId: z.coerce.number().int().positive().optional(),
    studentId: z.coerce.number().int().positive().optional(),
    subjectId: z.coerce.number().int().positive().optional(),
    courseId: z.coerce.number().int().positive().optional(),
    subject: z.string().trim().max(32).optional(),
    search: z.string().trim().max(200).optional(),
  })
  .merge(dateFilterSchema);

export const qaMonitoringAnswersQuerySchema = paginationSchema
  .extend({
    teacherId: z.coerce.number().int().positive().optional(),
    questionId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(200).optional(),
  })
  .merge(dateFilterSchema);

export const qaMonitoringActivityQuerySchema = paginationSchema
  .extend({
    teacherId: z.coerce.number().int().positive().optional(),
    questionId: z.coerce.number().int().positive().optional(),
    actionType: z
      .enum([
        TEACHER_ACTIVITY_ACTIONS.QUESTION_VIEWED,
        TEACHER_ACTIVITY_ACTIONS.QUESTION_ANSWERED,
        TEACHER_ACTIVITY_ACTIONS.ANSWER_UPDATED,
        TEACHER_ACTIVITY_ACTIONS.LOGIN,
        TEACHER_ACTIVITY_ACTIONS.LOGOUT,
        '',
      ])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .merge(dateFilterSchema);

export const qaMonitoringExportQuerySchema = z.object({
  type: z.enum(['questions', 'answers', 'activity']).default('questions'),
  format: z.enum(['json', 'csv']).default('csv'),
  status: statusSchema,
  teacherId: z.coerce.number().int().positive().optional(),
  studentId: z.coerce.number().int().positive().optional(),
  subjectId: z.coerce.number().int().positive().optional(),
  courseId: z.coerce.number().int().positive().optional(),
  subject: z.string().trim().max(32).optional(),
  search: z.string().trim().max(200).optional(),
  actionType: z
    .enum([
      TEACHER_ACTIVITY_ACTIONS.QUESTION_VIEWED,
      TEACHER_ACTIVITY_ACTIONS.QUESTION_ANSWERED,
      TEACHER_ACTIVITY_ACTIONS.ANSWER_UPDATED,
      TEACHER_ACTIVITY_ACTIONS.LOGIN,
      TEACHER_ACTIVITY_ACTIONS.LOGOUT,
      '',
    ])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  dateFrom: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(5000),
});

export const qaMonitoringStatsQuerySchema = dateFilterSchema.extend({
  teacherId: z.coerce.number().int().positive().optional(),
  courseId: z.coerce.number().int().positive().optional(),
});

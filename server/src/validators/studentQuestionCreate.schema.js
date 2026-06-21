import { z } from 'zod';
import { validateStudentQuestionWords } from '../utils/qaWordValidation.js';

const attachmentUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => value.startsWith('/api/uploads/student-qa/'), 'Invalid attachment URL')
  .refine((value) => !value.includes('..'), 'Invalid attachment URL')
  .optional()
  .nullable();

/**
 * Strict create payload — courseId and teacherId are intentionally rejected (mass-assignment / IDOR).
 */
export const studentQuestionCreateBodySchema = z
  .object({
    subjectId: z.coerce.number().int().positive(),
    body: z.string().trim().max(2000),
    imageUrl: attachmentUrlSchema,
    audioUrl: attachmentUrlSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasMedia = Boolean(data.imageUrl || data.audioUrl);
    const check = validateStudentQuestionWords(data.body, hasMedia);
    if (!check.ok && check.message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message, path: ['body'] });
    }
  });

/** Legacy slug payload — rejected at controller to force subjectId-only contract. */
export const studentQuestionLegacyBodySchema = z
  .object({
    subject: z.string().optional(),
    subjectId: z.coerce.number().int().positive().optional(),
    body: z.string().optional(),
    imageUrl: attachmentUrlSchema,
    courseId: z.coerce.number().optional(),
    teacherId: z.coerce.number().optional(),
  })
  .passthrough();

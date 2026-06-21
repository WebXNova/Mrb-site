import { z } from 'zod';
import { validateTeacherAnswerWords } from '../utils/qaWordValidation.js';

const teacherQaImageUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => value.startsWith('/api/uploads/teacher-qa/'), 'Invalid image URL')
  .refine((value) => !value.includes('..'), 'Invalid image URL')
  .refine((value) => !value.includes('-rec-'), 'Invalid image URL')
  .optional()
  .nullable();

const teacherQaAudioUrlSchema = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => value.startsWith('/api/uploads/teacher-qa/'), 'Invalid audio URL')
  .refine((value) => !value.includes('..'), 'Invalid audio URL')
  .refine((value) => value.includes('-rec-'), 'Invalid audio URL')
  .optional()
  .nullable();

export const teacherQuestionAnswerBodySchema = z
  .object({
    body: z.string().trim().max(5000, 'Answer is too long'),
    imageUrl: teacherQaImageUrlSchema,
    audioUrl: teacherQaAudioUrlSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasMedia = Boolean(data.imageUrl || data.audioUrl);
    const check = validateTeacherAnswerWords(data.body, hasMedia);
    if (!check.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message, path: ['body'] });
    }
  });

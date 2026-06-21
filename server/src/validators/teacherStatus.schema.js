import { z } from 'zod';

function preprocessTeacherStatusBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.confirm_deactivate != null && obj.confirmDeactivate == null) {
    obj.confirmDeactivate = obj.confirm_deactivate;
  }
  delete obj.confirm_deactivate;
  return obj;
}

export const teacherStatusBodySchema = z.preprocess(
  preprocessTeacherStatusBody,
  z
    .object({
      status: z.enum(['active', 'inactive']),
      reason: z.string().trim().min(1).max(500).optional(),
      confirmDeactivate: z.boolean().optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.status === 'inactive' && data.confirmDeactivate !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Deactivating a teacher requires confirmDeactivate: true',
          path: ['confirmDeactivate'],
        });
      }
    })
);

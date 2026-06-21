import { z } from 'zod';
import { strongPasswordSchema } from './password.schema.js';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'root', 'system', 'teacher']);

function preprocessTeacherUpdateBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.full_name != null && obj.fullName == null) obj.fullName = obj.full_name;
  if (obj.assigned_subjects != null && obj.assignedSubjects == null) {
    obj.assignedSubjects = obj.assigned_subjects;
  }
  if (obj.confirm_deactivate != null && obj.confirmDeactivate == null) {
    obj.confirmDeactivate = obj.confirm_deactivate;
  }
  delete obj.full_name;
  delete obj.assigned_subjects;
  delete obj.confirm_deactivate;
  if (obj.password === '' || obj.password == null) {
    delete obj.password;
  }
  return obj;
}

const assignedSubjectsSchema = z
  .array(z.number().int().positive())
  .min(1, 'Please assign at least one subject to the teacher.')
  .max(100)
  .refine((ids) => ids.length === new Set(ids).size, {
    message: 'Duplicate subject IDs are not allowed',
  });

const optionalPasswordSchema = z.preprocess(
  (value) => (value === '' || value == null ? undefined : value),
  strongPasswordSchema.optional()
);

export const teacherUpdateBodySchema = z.preprocess(
  preprocessTeacherUpdateBody,
  z
    .object({
      fullName: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(255),
      username: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(50)
        .regex(/^[a-z0-9._]+$/, 'Username can only contain lowercase letters, numbers, underscore, and dot')
        .refine((value) => !value.includes('@'), 'Username cannot contain @')
        .refine((value) => !RESERVED_USERNAMES.has(value), 'Username is not allowed'),
      password: optionalPasswordSchema,
      status: z.enum(['active', 'inactive']),
      assignedSubjects: assignedSubjectsSchema,
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

import { z } from 'zod';
import { strongPasswordSchema } from './password.schema.js';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'root', 'system', 'teacher']);

function preprocessTeacherCreateBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  if (obj.full_name != null && obj.fullName == null) obj.fullName = obj.full_name;
  if (obj.assigned_subjects != null && obj.assignedSubjects == null) {
    obj.assignedSubjects = obj.assigned_subjects;
  }
  delete obj.full_name;
  delete obj.assigned_subjects;
  return obj;
}

const assignedSubjectsSchema = z
  .array(z.number().int().positive())
  .min(1, 'Please assign at least one subject to the teacher.')
  .max(100)
  .refine((ids) => ids.length === new Set(ids).size, {
    message: 'Duplicate subject IDs are not allowed',
  });

export const teacherCreateBodySchema = z.preprocess(
  preprocessTeacherCreateBody,
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
      password: strongPasswordSchema,
      status: z.enum(['active', 'inactive']),
      assignedSubjects: assignedSubjectsSchema,
    })
    .strict()
);

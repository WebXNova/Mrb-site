import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';
import { HSSC_STATUS_VALUES } from './enrollment.dto.js';

const pakistaniWhatsappSchema = z
  .string()
  .regex(/^\+923[0-9]{9}$/, 'Enter a valid Pakistan WhatsApp number');

export const CreatePaidStandaloneRegistrationDto = z
  .object({
    applicantFullName: z.string().min(2).max(160),
    fatherName: z.string().min(2).max(160),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .nullable(),
    gender: z.enum(['male', 'female']),
    whatsappNumber: pakistaniWhatsappSchema,
    email: z.string().email(),
    province_id: z.coerce.number().int().positive(),
    district_id: z.coerce.number().int().positive(),
    city_id: z.coerce.number().int().positive(),
    board_id: z.coerce.number().int().positive().optional().nullable(),
    hsscStatus: z.enum(HSSC_STATUS_VALUES),
    mdcatAttemptType: z.enum(['Fresher', 'Improver']),
  })
  .strict();

export function parseCreatePaidStandaloneRegistrationDto(input) {
  const parsed = CreatePaidStandaloneRegistrationDto.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid registration payload', {
      code: 'VALIDATION_ERROR',
      issues: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

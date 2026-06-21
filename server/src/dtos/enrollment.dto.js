import { z } from 'zod';
import { toEnrollmentStateResponse as mapEnrollmentState } from '../services/enrollmentState.service.js';
import {
  ADMISSION_STATUS,
  courseEnrollmentMessage,
  isCourseEnrollmentOpen,
  normalizeAdmissionStatus,
  normalizeDateOnly,
} from '../models/course.model.js';

const pakistaniWhatsappSchema = z
  .string()
  .regex(/^\+923[0-9]{9}$/, 'Enter a valid Pakistan WhatsApp number');

/** POST /api/enrollments — student registration payload. */
export const CreateEnrollmentDto = z.object({
  course_id: z.coerce.number().int().positive(),
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
  hsscStatus: z.enum(['Inter Class', 'First Year Class', 'Matric Class']),
  mdcatAttemptType: z.enum(['Fresher', 'Improver']),
  confirmSwitch: z.boolean().default(false),
});

/**
 * @param {unknown} input
 */
export function parseCreateEnrollmentDto(input) {
  return CreateEnrollmentDto.parse(input);
}

/**
 * Enrollment state API response (CTA + admission context).
 * @param {import('../services/enrollmentState.service.js').EnrollmentStateResult} enrollmentState
 * @param {{ courseId?: number, courseName?: string, admission_status?: string|null, start_date?: string|null, end_date?: string|null }|null} [courseAdmission]
 */
export function toEnrollmentStateResponse(enrollmentState, courseAdmission = null) {
  const base = mapEnrollmentState(enrollmentState);
  const admissionStatus =
    courseAdmission?.admission_status != null
      ? normalizeAdmissionStatus(courseAdmission.admission_status)
      : null;
  const isEnrollmentOpen = admissionStatus
    ? isCourseEnrollmentOpen({ admission_status: admissionStatus })
    : null;

  return {
    ...base,
    courseId: courseAdmission?.courseId ?? base.targetCourseId ?? null,
    courseName: courseAdmission?.courseName ?? base.enrolledCourseName ?? null,
    admissionStatus,
    isEnrollmentOpen,
    isEnrolled: base.buttonState === 'continue_learning',
    startDate: normalizeDateOnly(courseAdmission?.start_date),
    endDate: normalizeDateOnly(courseAdmission?.end_date),
    message:
      admissionStatus != null
        ? courseEnrollmentMessage({ admission_status: admissionStatus })
        : null,
    admissionsClosed: admissionStatus === ADMISSION_STATUS.CLOSED,
  };
}

/**
 * Compact enrollment eligibility snippet for course cards.
 * @param {Record<string, unknown>|null|undefined} course
 */
export function toCourseEnrollmentSummary(course) {
  if (!course) return null;
  const admission_status = normalizeAdmissionStatus(course.admission_status);
  return {
    admission_status,
    is_enrollment_open: isCourseEnrollmentOpen({ admission_status }),
    enrollment_message: courseEnrollmentMessage({ admission_status }),
    start_date: normalizeDateOnly(course.start_date),
    end_date: normalizeDateOnly(course.end_date),
  };
}

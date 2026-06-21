import { z } from 'zod';
import {
  ADMISSION_STATUS,
  ADMISSION_STATUS_VALUES,
  COURSE_LEVELS,
  applyCourseModelHooks,
  courseEnrollmentMessage,
  isCourseEnrollmentOpen,
  normalizeAdmissionStatus,
  normalizeDateOnly,
  validateCourseDateRange,
} from '../models/course.model.js';

const dateOnlySchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => normalizeDateOnly(v))
  .pipe(z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional());

const admissionStatusSchema = z.enum(ADMISSION_STATUS_VALUES);

function dateRangeRefine(data, ctx) {
  const check = validateCourseDateRange(data.start_date ?? null, data.end_date ?? null);
  if (!check.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: check.message,
      path: ['end_date'],
    });
  }
}

const courseCoreSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().optional().nullable(),
  short_description: z.string().max(512).optional().nullable(),
  level: z.enum(COURSE_LEVELS).optional().default('beginner'),
  thumbnail_url: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().optional(),
  start_date: dateOnlySchema,
  end_date: dateOnlySchema,
  admission_status: admissionStatusSchema.optional(),
});

/**
 * Create course — full validation + auto admission hook after parse.
 */
export const CreateCourseDto = courseCoreSchema
  .superRefine(dateRangeRefine)
  .transform((data) =>
    applyCourseModelHooks(data, {
      explicitAdmissionStatus: data.admission_status !== undefined,
    })
  );

/**
 * Update course — partial fields; date range validated when both dates present.
 */
export const UpdateCourseDto = courseCoreSchema
  .partial()
  .superRefine((data, ctx) => {
    if (data.start_date !== undefined || data.end_date !== undefined) {
      dateRangeRefine(
        { start_date: data.start_date ?? null, end_date: data.end_date ?? null },
        ctx
      );
    }
  })
  .transform((data) =>
    applyCourseModelHooks(data, {
      explicitAdmissionStatus: data.admission_status !== undefined,
    })
  );

/** @deprecated Alias — use CreateCourseDto */
export const CreateCourseAdmissionDto = CreateCourseDto;

/** @deprecated Alias — use UpdateCourseDto */
export const UpdateCourseAdmissionDto = UpdateCourseDto;

/**
 * Canonical simplified course API response.
 * @param {Record<string, unknown>|null|undefined} course
 */
export function toCourseResponse(course) {
  if (!course) return null;

  const start_date = normalizeDateOnly(course.start_date);
  const end_date = normalizeDateOnly(course.end_date);
  const admission_status = normalizeAdmissionStatus(course.admission_status);
  const isOpen = isCourseEnrollmentOpen({ admission_status });

  return {
    id: course.id ?? null,
    title: course.title ?? '',
    description: course.description ?? null,
    short_description: course.short_description ?? null,
    level: course.level ?? 'beginner',
    thumbnail_url: course.thumbnail_url ?? course.image_url ?? null,
    is_active: course.is_active !== undefined ? Boolean(course.is_active) : true,
    start_date,
    end_date,
    admission_status,
    is_enrollment_open: isOpen,
    enrollment_message: courseEnrollmentMessage({ admission_status }),
    created_at: course.created_at ?? null,
    updated_at: course.updated_at ?? null,
  };
}

/**
 * @param {Array<Record<string, unknown>>} courses
 */
export function toCourseListResponse(courses) {
  if (!Array.isArray(courses)) return [];
  return courses.map((course) => toCourseResponse(course)).filter(Boolean);
}

/**
 * @param {unknown} input
 */
export function parseCreateCourseDto(input) {
  return CreateCourseDto.parse(input);
}

/**
 * @param {unknown} input
 */
export function parseUpdateCourseDto(input) {
  return UpdateCourseDto.parse(input);
}

/** @deprecated — use toCourseResponse */
export function toCourseAdmissionResponse(course) {
  const res = toCourseResponse(course);
  if (!res) return null;
  return {
    start_date: res.start_date,
    end_date: res.end_date,
    admission_status: res.admission_status,
    is_enrollment_open: res.is_enrollment_open,
    enrollment_message: res.enrollment_message,
  };
}

/** @deprecated — use toCourseListResponse */
export function toCourseAdmissionListResponse(courses) {
  return toCourseListResponse(courses);
}

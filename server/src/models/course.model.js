/**
 * Course domain model — schema constants, normalization, and pre-save hooks.
 * Persistence uses mysql2 services (not ORM).
 */

export const ADMISSION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
});

/** @type {readonly ('OPEN'|'CLOSED')[]} */
export const ADMISSION_STATUS_VALUES = Object.freeze([ADMISSION_STATUS.OPEN, ADMISSION_STATUS.CLOSED]);

export const COURSE_LEVELS = Object.freeze(['beginner', 'intermediate', 'advanced']);

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Canonical course columns (courses table).
 * @type {readonly string[]}
 */
export const COURSE_MODEL_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'short_description',
  'level',
  'image_url',
  'is_active',
  'created_by',
  'start_date',
  'end_date',
  'admission_status',
  'created_at',
  'updated_at',
]);

/** @deprecated Preserved for backward compatibility — live on course_batches in canonical schema. */
export const DEPRECATED_ENROLLMENT_FIELDS = Object.freeze([
  'enrollment_open_at',
  'enrollment_close_at',
  'allow_enrollment',
]);

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeDateOnly(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  if (DATE_ONLY_PATTERN.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string|null|undefined} startDate
 * @param {string|null|undefined} endDate
 */
export function validateCourseDateRange(startDate, endDate) {
  if (!startDate || !endDate) return { ok: true };
  if (endDate < startDate) {
    return { ok: false, message: 'End date must be on or after start date' };
  }
  return { ok: true };
}

/**
 * Normalize admission_status to OPEN | CLOSED.
 * @param {unknown} value
 * @returns {'OPEN'|'CLOSED'}
 */
export function normalizeAdmissionStatus(value) {
  return String(value || '').toUpperCase() === ADMISSION_STATUS.OPEN
    ? ADMISSION_STATUS.OPEN
    : ADMISSION_STATUS.CLOSED;
}

/**
 * Infer admission status from course dates when not explicitly set.
 * @param {{ start_date?: string|null, end_date?: string|null, admission_status?: string|null }} course
 * @returns {'OPEN'|'CLOSED'}
 */
export function resolveAdmissionStatusFromDates(course) {
  const explicit = String(course?.admission_status ?? '').trim().toUpperCase();
  if (explicit === ADMISSION_STATUS.OPEN || explicit === ADMISSION_STATUS.CLOSED) {
    return explicit;
  }

  const start = normalizeDateOnly(course?.start_date);
  const end = normalizeDateOnly(course?.end_date);
  if (!start || !end) return ADMISSION_STATUS.CLOSED;

  const today = new Date().toISOString().slice(0, 10);
  return today >= start && today <= end ? ADMISSION_STATUS.OPEN : ADMISSION_STATUS.CLOSED;
}

/**
 * Pre-validate / pre-save hook — normalizes dates and auto-sets admission_status when omitted.
 * Mirrors Sequelize `beforeValidate` behavior for the simplified schema.
 *
 * @param {Record<string, unknown>} course
 * @param {{ explicitAdmissionStatus?: boolean }} [options]
 * @returns {Record<string, unknown>}
 */
export function applyCourseModelHooks(course, options = {}) {
  const next = { ...course };
  next.start_date = normalizeDateOnly(next.start_date);
  next.end_date = normalizeDateOnly(next.end_date);

  const hasExplicitAdmission =
    options.explicitAdmissionStatus === true ||
    (next.admission_status !== undefined &&
      next.admission_status !== null &&
      String(next.admission_status).trim() !== '');

  if (hasExplicitAdmission) {
    next.admission_status = normalizeAdmissionStatus(next.admission_status);
  } else {
    next.admission_status = resolveAdmissionStatusFromDates({
      start_date: next.start_date,
      end_date: next.end_date,
      admission_status: null,
    });
  }

  return next;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {Record<string, unknown>}
 */
export function extractDeprecatedEnrollmentFields(row) {
  if (!row) {
    return {
      enrollment_open_at: null,
      enrollment_close_at: null,
      allow_enrollment: null,
    };
  }
  return {
    enrollment_open_at: row.enrollment_open_at ?? null,
    enrollment_close_at: row.enrollment_close_at ?? null,
    allow_enrollment:
      row.allow_enrollment === undefined || row.allow_enrollment === null
        ? null
        : Boolean(Number(row.allow_enrollment)),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isCourseEnrollmentOpen(row) {
  return normalizeAdmissionStatus(row?.admission_status) === ADMISSION_STATUS.OPEN;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
export function courseEnrollmentMessage(row) {
  return isCourseEnrollmentOpen(row)
    ? 'Enrollment is open'
    : 'Admissions are currently closed.';
}

/**
 * Derive course-level admission date hints from a wizard batch payload.
 * admission_status is set on the course schedule step — not from batch windows.
 * @param {Record<string, unknown>|null|undefined} batch
 */
export function deriveCourseAdmissionFromBatch(batch) {
  if (!batch) {
    return {
      start_date: null,
      end_date: null,
      admission_status: ADMISSION_STATUS.CLOSED,
    };
  }

  const start_date = normalizeDateOnly(batch.start_date);
  const end_date = normalizeDateOnly(batch.end_date);

  let admission_status = ADMISSION_STATUS.CLOSED;
  if (
    ['enrollment_open', 'published', 'upcoming'].includes(String(batch.status || '').toLowerCase())
  ) {
    admission_status = ADMISSION_STATUS.OPEN;
  }

  return { start_date, end_date, admission_status };
}

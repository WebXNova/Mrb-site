/**
 * Course-level admission status for student-facing UI.
 * Mirrors server course.model admission helpers.
 */

export const ADMISSION_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
});

export function normalizeAdmissionStatus(value) {
  const status = String(value || ADMISSION_STATUS.CLOSED).trim().toUpperCase();
  return status === ADMISSION_STATUS.OPEN ? ADMISSION_STATUS.OPEN : ADMISSION_STATUS.CLOSED;
}

export function isAdmissionOpen(courseOrStatus) {
  if (courseOrStatus && typeof courseOrStatus === 'object') {
    if (courseOrStatus.is_enrollment_open === true) return true;
    if (courseOrStatus.is_enrollment_open === false) return false;
    return normalizeAdmissionStatus(courseOrStatus.admission_status) === ADMISSION_STATUS.OPEN;
  }
  return normalizeAdmissionStatus(courseOrStatus) === ADMISSION_STATUS.OPEN;
}

export function admissionEnrollmentMessage(courseOrStatus) {
  if (courseOrStatus && typeof courseOrStatus === 'object' && courseOrStatus.enrollment_message) {
    return String(courseOrStatus.enrollment_message);
  }
  return isAdmissionOpen(courseOrStatus)
    ? 'Enrollment is open'
    : 'Admissions are currently closed.';
}

export function admissionBadgeTone(status) {
  return isAdmissionOpen(status) ? 'success' : 'warning';
}

export function admissionBadgeLabel(status) {
  return normalizeAdmissionStatus(
    typeof status === 'object' ? status?.admission_status : status
  );
}

/**
 * Extract admission fields from catalog API course rows.
 * @param {Record<string, unknown>|null|undefined} course
 */
export function extractCourseAdmission(course) {
  if (!course || typeof course !== 'object') {
    return {
      admission_status: ADMISSION_STATUS.CLOSED,
      is_enrollment_open: false,
      enrollment_message: admissionEnrollmentMessage(ADMISSION_STATUS.CLOSED),
      start_date: null,
      end_date: null,
    };
  }
  const admission_status = normalizeAdmissionStatus(course.admission_status);
  const is_enrollment_open =
    course.is_enrollment_open === true || course.is_enrollment_open === false
      ? Boolean(course.is_enrollment_open)
      : admission_status === ADMISSION_STATUS.OPEN;
  return {
    admission_status,
    is_enrollment_open,
    enrollment_message:
      typeof course.enrollment_message === 'string' && course.enrollment_message.trim()
        ? course.enrollment_message.trim()
        : admissionEnrollmentMessage(admission_status),
    start_date: course.start_date ?? null,
    end_date: course.end_date ?? null,
  };
}

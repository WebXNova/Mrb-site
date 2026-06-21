import { ENROLLMENT_BUTTON_STATE } from '../course/courseEnrollmentCta.js';
import { extractCourseAdmission } from '../course/courseAdmissionPresentation.js';

/**
 * Normalize GET /enrollments/state/:courseId payload.
 * @param {Record<string, unknown>|null|undefined} raw
 */
export function normalizeEnrollmentState(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const buttonState =
    typeof raw.buttonState === 'string' ? raw.buttonState : ENROLLMENT_BUTTON_STATE.ENROLL_NOW;
  const admissionStatus = raw.admissionStatus ?? raw.admission_status ?? null;
  const isEnrollmentOpen =
    raw.isEnrollmentOpen ??
    raw.is_enrollment_open ??
    (admissionStatus === 'OPEN' ? true : admissionStatus === 'CLOSED' ? false : null);

  return {
    enrolledCourseId: raw.enrolledCourseId ?? null,
    enrolledCourseName: raw.enrolledCourseName ?? null,
    enrollmentType: raw.enrollmentType ?? null,
    canEnroll: Boolean(raw.canEnroll),
    canSwitch: Boolean(raw.canSwitch),
    canUpgrade: Boolean(raw.canUpgrade),
    buttonState,
    requiresSwitchConfirmation: Boolean(raw.requiresSwitchConfirmation),
    targetCourseId: raw.targetCourseId ?? raw.courseId ?? null,
    targetEnrollmentType: raw.targetEnrollmentType ?? null,
    enrollmentId: raw.enrollmentId ?? null,
    orderId: raw.orderId ?? null,
    courseId: raw.courseId ?? raw.targetCourseId ?? null,
    courseName: raw.courseName ?? null,
    admissionStatus,
    isEnrollmentOpen,
    isEnrolled:
      raw.isEnrolled === true ||
      buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING,
    startDate: raw.startDate ?? raw.start_date ?? null,
    endDate: raw.endDate ?? raw.end_date ?? null,
    message:
      typeof raw.message === 'string'
        ? raw.message
        : typeof raw.enrollment_message === 'string'
          ? raw.enrollment_message
          : null,
    admissionsClosed:
      raw.admissionsClosed === true ||
      buttonState === ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED,
    canContinueLearning: buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING,
  };
}

/**
 * Normalize a row from GET /enrollments/me.
 * @param {Record<string, unknown>} row
 */
export function normalizeEnrollmentRow(row) {
  if (!row || typeof row !== 'object') return null;
  const courseId = row.courseId ?? row.course_id ?? null;
  const admission = extractCourseAdmission(row);
  return {
    id: row.id ?? null,
    courseId,
    courseTitle: row.courseTitle ?? row.course_title ?? null,
    courseSlug: row.courseSlug ?? row.course_slug ?? null,
    status: row.status ?? null,
    accessStatus: row.accessStatus ?? row.access_status ?? null,
    enrollmentSource: row.enrollmentSource ?? row.enrollment_source ?? null,
    orderId: row.orderId ?? row.order_id ?? null,
    orderStatus: row.orderStatus ?? row.order_status ?? null,
    orderPaidAt: row.orderPaidAt ?? row.order_paid_at ?? null,
    createdAt: row.createdAt ?? row.created_at ?? row.submittedAt ?? null,
    reviewedAt: row.reviewedAt ?? row.reviewed_at ?? null,
    ...admission,
  };
}

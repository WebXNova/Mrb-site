/**
 * Authoritative enrollment CTA states — must match server enrollmentButtonState.js.
 * Frontend renders buttons from API buttonState only.
 */
export const ENROLLMENT_BUTTON_STATE = Object.freeze({
  ENROLL_NOW: 'enroll_now',
  CONTINUE_LEARNING: 'continue_learning',
  SWITCH_COURSE: 'switch_course',
  UPGRADE_COURSE: 'upgrade_course',
  PAYMENT_PENDING: 'payment_pending',
  CONTACT_SUPPORT: 'contact_support',
  ADMISSIONS_CLOSED: 'admissions_closed',
  PREMIUM_BLOCKS_FREE: 'premium_blocks_free',
  SEATS_FILLED: 'seats_filled',
});

const ACTIVE_LABELS = {
  card: 'Continue Learning',
  hero: 'Go to Course',
  pricing: 'Continue Learning',
  bottom: 'Continue Learning',
  sticky: 'Resume Course',
};

const DEFAULT_GUEST_STATE = Object.freeze({
  enrolledCourseId: null,
  enrolledCourseName: null,
  enrollmentType: null,
  canEnroll: true,
  canSwitch: false,
  canUpgrade: false,
  buttonState: ENROLLMENT_BUTTON_STATE.ENROLL_NOW,
  requiresSwitchConfirmation: false,
  targetCourseId: null,
  targetEnrollmentType: null,
  enrollmentId: null,
  orderId: null,
});

function buildPaymentResumeTarget(courseId, enrollmentState) {
  const id = String(courseId);
  if (enrollmentState?.enrollmentId) {
    return {
      pathname: '/enrollment/payment',
      state: {
        enrollmentId: enrollmentState.enrollmentId,
        courseId: Number(id),
        orderId: enrollmentState.orderId ?? null,
      },
    };
  }
  return `/enroll/${encodeURIComponent(id)}`;
}

function buildEnrollTarget(courseId, confirmSwitch = false) {
  const base = `/enroll/${encodeURIComponent(String(courseId))}`;
  const params = new URLSearchParams();
  params.set('targetCourseId', String(courseId));
  if (confirmSwitch) params.set('confirmSwitch', '1');
  return `${base}?${params.toString()}`;
}

/**
 * Map backend enrollment state to CTA presentation.
 * @param {object|null|undefined} enrollmentState — from GET /enrollments/state/:courseId
 * @param {{ courseId: string|number, labelContext?: string, confirmSwitch?: boolean }} options
 */
export function buildCourseEnrollmentCtaFromState(enrollmentState, options) {
  const { courseId, labelContext = 'card', confirmSwitch = false } = options;
  const state = enrollmentState ?? DEFAULT_GUEST_STATE;
  const buttonState = state.buttonState || ENROLLMENT_BUTTON_STATE.ENROLL_NOW;

  switch (buttonState) {
    case ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING:
      return {
        buttonState,
        label: ACTIVE_LABELS[labelContext] || ACTIVE_LABELS.card,
        to: '/dashboard/lectures',
        variant: 'accent',
        disabled: false,
        requiresSwitchConfirmation: false,
      };
    case ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING:
      return {
        buttonState,
        label: 'Payment Pending',
        to: buildPaymentResumeTarget(courseId, state),
        variant: 'secondary',
        disabled: false,
        requiresSwitchConfirmation: false,
      };
    case ENROLLMENT_BUTTON_STATE.CONTACT_SUPPORT:
      return {
        buttonState,
        label: 'Contact Support',
        to: '/contact',
        variant: 'secondary',
        disabled: false,
        requiresSwitchConfirmation: false,
      };
    case ENROLLMENT_BUTTON_STATE.SWITCH_COURSE:
      return {
        buttonState,
        label: 'Switch Course',
        to: buildEnrollTarget(courseId, confirmSwitch),
        variant: 'accent',
        disabled: false,
        requiresSwitchConfirmation: true,
        enrolledCourseName: state.enrolledCourseName,
      };
    case ENROLLMENT_BUTTON_STATE.UPGRADE_COURSE:
      return {
        buttonState,
        label: 'Upgrade Course',
        to: buildEnrollTarget(courseId, confirmSwitch),
        variant: 'accent',
        disabled: false,
        requiresSwitchConfirmation: true,
        enrolledCourseName: state.enrolledCourseName,
      };
    case ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED:
      return {
        buttonState,
        label: 'Enrollment Closed',
        to: null,
        variant: 'secondary',
        disabled: true,
        requiresSwitchConfirmation: false,
      };
    case ENROLLMENT_BUTTON_STATE.PREMIUM_BLOCKS_FREE:
      return {
        buttonState,
        label: 'Enroll Now',
        to: null,
        variant: 'secondary',
        disabled: true,
        requiresSwitchConfirmation: false,
        tooltip:
          'You have purchased a premium course. Free courses are no longer available for enrollment.',
      };
    case ENROLLMENT_BUTTON_STATE.SEATS_FILLED:
      return {
        buttonState,
        label: 'Seats Filled',
        to: null,
        variant: 'secondary',
        disabled: true,
        requiresSwitchConfirmation: false,
        tooltip: 'This course has reached its seat capacity.',
      };
    default:
      return {
        buttonState: ENROLLMENT_BUTTON_STATE.ENROLL_NOW,
        label: 'Enroll Now',
        to: buildEnrollTarget(courseId, false),
        variant: 'accent',
        disabled: false,
        requiresSwitchConfirmation: false,
      };
  }
}

/** @deprecated Use buildCourseEnrollmentCtaFromState with backend state instead. */
export const COURSE_ENROLLMENT_UX = {
  NOT_ENROLLED: 'NOT_ENROLLED',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
};

/** @deprecated */
export function resolveCourseEnrollmentUxState() {
  return COURSE_ENROLLMENT_UX.NOT_ENROLLED;
}

/**
 * Guest / logged-out CTA when catalog admission is known.
 * @param {{ is_enrollment_open?: boolean, admission_status?: string }} courseAdmission
 * @param {{ courseId: string|number, labelContext?: string }} options
 */
export function buildGuestEnrollmentCtaFromAdmission(courseAdmission, options) {
  const open =
    courseAdmission?.is_enrollment_open === true ||
    (courseAdmission?.is_enrollment_open !== false &&
      String(courseAdmission?.admission_status || '').toUpperCase() === 'OPEN');
  if (!open) {
    return buildCourseEnrollmentCtaFromState(
      { buttonState: ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED },
      options
    );
  }
  return buildCourseEnrollmentCtaFromState(null, options);
}

/** @deprecated — kept for legacy tests; use buildCourseEnrollmentCtaFromState */
export function buildCourseEnrollmentCta({ courseId, labelContext = 'card' }) {
  return buildCourseEnrollmentCtaFromState(DEFAULT_GUEST_STATE, { courseId, labelContext });
}

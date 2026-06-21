/**
 * Authoritative enrollment CTA states — returned by GET /api/enrollments/state/:courseId.
 * Frontend must render buttons from buttonState only (no client-side inference).
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

/** @type {readonly string[]} */
export const ENROLLMENT_BUTTON_STATE_VALUES = Object.freeze(Object.values(ENROLLMENT_BUTTON_STATE));

/**
 * Maps enrollment tier for API responses (free = free course, premium = paid course).
 * @typedef {'free' | 'premium' | null} EnrollmentType
 */

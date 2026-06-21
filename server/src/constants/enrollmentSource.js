/**
 * How instructional access was granted on enrollments (canonical `enrollments` table).
 * Maps to spec `enrollment_source` on user_course_enrollments.
 */

export const ENROLLMENT_SOURCE = Object.freeze({
  FREE: 'free',
  PAID: 'paid',
});

/** @type {readonly string[]} */
export const ENROLLMENT_SOURCE_VALUES = Object.freeze([ENROLLMENT_SOURCE.FREE, ENROLLMENT_SOURCE.PAID]);

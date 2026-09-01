/**
 * Test access classification (Phase 2 foundation).
 * Distinct from tests.test_type (subject_wise | mixed_subject).
 */

export const TEST_ACCESS_TYPE_VALUES = Object.freeze([
  'course_locked',
  'free_standalone',
  'paid_standalone',
]);


export const TEST_ACCESS_TYPE_COURSE_LOCKED = 'course_locked';
export const TEST_ACCESS_TYPE_FREE_STANDALONE = 'free_standalone';
export const TEST_ACCESS_TYPE_PAID_STANDALONE = 'paid_standalone';

export const DEFAULT_TEST_ACCESS_TYPE = TEST_ACCESS_TYPE_COURSE_LOCKED;

/** SQL fragment: standalone rows never join a course. */
export const STANDALONE_TEST_JOIN_SQL =
  "t.test_access_type IN ('paid_standalone', 'free_standalone') AND t.course_id IS NULL";

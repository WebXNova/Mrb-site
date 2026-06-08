/**
 * Student-eligible test visibility rules (Phase 1C).
 * Published-only, non-deleted; excludes draft/archived lifecycle states.
 */

/** DB status value for student-visible tests (matches CEE testEntitlement). */
export const STUDENT_ELIGIBLE_TEST_STATUS = 'published';

/** Status values that must never appear in student listings. */
export const STUDENT_EXCLUDED_TEST_STATUSES = Object.freeze([
  'DRAFT',
  'INCOMPLETE',
  'READY_FOR_PUBLISH',
  'archived',
]);

/**
 * SQL fragment — append after `tests t` alias with leading AND.
 * @param {string} [alias='t']
 */
export function buildStudentEligibleTestFilterSql(alias = 't') {
  const a = alias;
  return `
    AND ${a}.deleted_at IS NULL
    AND ${a}.status = '${STUDENT_ELIGIBLE_TEST_STATUS}'
  `.trim();
}

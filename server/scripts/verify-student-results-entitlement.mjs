/**
 * CEE verification: entitled student results SQL passes scopedQueryGuard.
 * Run: node scripts/verify-student-results-entitlement.mjs
 */
import { validateScopedQuery } from '../src/security/cee/scopedQueryGuard.js';

const RESULTS_SQL = `
     SELECT a.id AS attempt_id
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id
       AND t.course_id = ?
       AND t.course_id IS NOT NULL
     WHERE a.user_id = ?
       AND a.status = 'submitted'`;

const LEGACY_UNSAFE_SQL = `
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id
     WHERE a.user_id = ?`;

function assertGuardAllows(label, sql) {
  const result = validateScopedQuery({
    sql,
    courseId: 42,
    context: 'verify.studentResults',
    userId: 7,
    skipAudit: true,
  });
  if (!result.allowed) {
    throw new Error(`${label}: expected allowed`);
  }
  console.log(`PASS ${label}`);
}

function assertGuardDenies(label, sql) {
  try {
    validateScopedQuery({
      sql,
      courseId: 42,
      context: 'verify.studentResults',
      userId: 7,
      skipAudit: true,
    });
    throw new Error(`${label}: expected deny`);
  } catch (error) {
    if (error.name === 'CeeUnscopedQueryDeniedError' || error.errorCode === 'CEE_UNSCOPED_QUERY_DENIED') {
      console.log(`PASS ${label} (denied as expected)`);
      return;
    }
    throw error;
  }
}

assertGuardAllows('entitled results SQL', RESULTS_SQL);
assertGuardDenies('legacy user-only SQL', LEGACY_UNSAFE_SQL);
console.log('All student results entitlement checks passed.');

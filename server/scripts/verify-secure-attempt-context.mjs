/**
 * Verifies CEE scoped SQL patterns used by secure test attempt layer.
 * Run: node scripts/verify-secure-attempt-context.mjs
 */
import { validateScopedQuery } from '../src/security/cee/scopedQueryGuard.js';

const SCOPED_ATTEMPT_SELECT = `
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?`;

const UNSCOPED_ATTEMPT_SELECT = `
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id
  WHERE a.id = ?`;

function assertAllows(label, sql) {
  const r = validateScopedQuery({
    sql,
    courseId: 5,
    context: 'verify.secureAttempt',
    userId: 9,
    skipAudit: true,
  });
  if (!r.allowed) throw new Error(`${label}: expected allowed`);
  console.log(`PASS ${label}`);
}

function assertDenies(label, sql) {
  try {
    validateScopedQuery({
      sql,
      courseId: 5,
      context: 'verify.secureAttempt',
      userId: 9,
      skipAudit: true,
    });
    throw new Error(`${label}: expected deny`);
  } catch (e) {
    if (e.errorCode === 'CEE_UNSCOPED_QUERY_DENIED' || e.name === 'CeeUnscopedQueryDeniedError') {
      console.log(`PASS ${label}`);
      return;
    }
    throw e;
  }
}

assertAllows('secure attempt join', SCOPED_ATTEMPT_SELECT);
assertDenies('legacy attempt without course', UNSCOPED_ATTEMPT_SELECT);
console.log('Secure attempt SQL verification complete.');

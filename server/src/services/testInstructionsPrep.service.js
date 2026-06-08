/**
 * Authenticated prep data for the test instructions page (attempt limits).
 */

import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import { resolveEntitledTestBySlug } from '../security/cee/testEntitlement.service.js';

/**
 * @param {{ slug: string, studentId: number, courseId: number }}
 */
export async function loadTestInstructionsPrep({ slug, studentId, courseId }) {
  const normalizedSlug = String(slug || '').trim();
  const sid = Number(studentId);
  const cid = Number(courseId);

  const test = await resolveEntitledTestBySlug(normalizedSlug, cid);
  const testId = Number(test.id);
  const maxAttempts = Number(test.maxAttempts ?? 1);

  const db = scopedQuery({ courseId: cid, context: 'testInstructionsPrep.load' });

  const countRow = await db.first(
    `SELECT COUNT(*) AS total
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     WHERE a.test_id = ?
       AND (a.student_id = ? OR a.user_id = ?)`,
    [cid, testId, sid, sid]
  );
  const attemptsUsed = Number(countRow?.total ?? 0);

  const activeRow = await db.first(
    `SELECT a.id
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     WHERE a.test_id = ?
       AND a.status = 'in_progress'
       AND (a.student_id = ? OR a.user_id = ?)
     LIMIT 1`,
    [cid, testId, sid, sid]
  );
  const hasActiveAttempt = Boolean(activeRow);

  const unlimited = maxAttempts <= 0;
  const attemptsRemaining = unlimited ? null : Math.max(0, maxAttempts - attemptsUsed);
  const canStart = hasActiveAttempt || unlimited || attemptsUsed < maxAttempts;

  return {
    testId,
    attemptsUsed,
    maxAttempts: unlimited ? null : maxAttempts,
    attemptsRemaining,
    hasActiveAttempt,
    canStart,
  };
}

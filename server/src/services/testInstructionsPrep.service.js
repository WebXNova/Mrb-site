/**
 * Authenticated prep data for the test instructions page (attempt limits + G-RT-03/G-RT-04).
 */

import { mysqlPool } from '../config/mysql.js';
import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import { resolveEntitledTestBySlug } from '../security/cee/testEntitlement.service.js';
import {
  assertTestAvailabilityWindow,
  AVAILABILITY_PHASE,
  evaluateTestAvailabilityWindow,
  getAvailabilityNowMs,
} from './testAvailabilityWindow.service.js';
import {
  computePrepCanStart,
  evaluateRetakePolicy,
} from './testRetakePolicy.service.js';

/**
 * @param {{ slug: string, studentId: number, courseId: number }}
 */
export async function loadTestInstructionsPrep({ slug, studentId, courseId }) {
  const normalizedSlug = String(slug || '').trim();
  const sid = Number(studentId);
  const cid = Number(courseId);

  const test = await resolveEntitledTestBySlug(normalizedSlug, cid);
  const testId = Number(test.id);

  const db = scopedQuery({ courseId: cid, context: 'testInstructionsPrep.load' });

  const settingsRow = await db.first(
    `SELECT start_date, end_date, max_attempts, allow_retake
     FROM tests WHERE id = ? AND course_id = ? LIMIT 1`,
    [testId, cid]
  );

  const nowMs = await getAvailabilityNowMs(mysqlPool);

  assertTestAvailabilityWindow(
    { id: testId, start_date: settingsRow?.start_date, end_date: settingsRow?.end_date },
    { phase: AVAILABILITY_PHASE.ANY_ACCESS, nowMs, context: 'testInstructionsPrep' }
  );

  const availability = evaluateTestAvailabilityWindow(
    {
      id: testId,
      start_date: settingsRow?.start_date,
      end_date: settingsRow?.end_date,
    },
    nowMs
  );

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

  const retakePolicy = evaluateRetakePolicy(
    {
      id: testId,
      max_attempts: settingsRow?.max_attempts,
      allow_retake: settingsRow?.allow_retake,
    },
    { totalAttempts: attemptsUsed, hasActiveAttempt }
  );

  const unlimited = retakePolicy.maxAttempts == null;
  const attemptsRemaining =
    unlimited ? null : Math.max(0, (retakePolicy.maxAttempts ?? 0) - attemptsUsed);

  const canStartNew =
    availability.canCreateAttempt && retakePolicy.canCreateNew;
  const canStart = hasActiveAttempt
    ? computePrepCanStart(retakePolicy, true) && availability.canResumeInProgress
    : canStartNew;

  return {
    testId,
    attemptsUsed,
    maxAttempts: unlimited ? null : retakePolicy.maxAttempts,
    attemptsRemaining,
    hasActiveAttempt,
    canStart,
    allowRetake: retakePolicy.allowRetake,
    retakePolicy: {
      allowRetake: retakePolicy.allowRetake,
      canCreateNew: retakePolicy.canCreateNew,
      canResumeActive: retakePolicy.canResumeActive,
      denyCode: retakePolicy.denyCode,
      denyReason: retakePolicy.denyReason,
    },
    availability: {
      notYetAvailable: availability.notYetAvailable,
      noLongerAvailable: availability.noLongerAvailable && !hasActiveAttempt,
      canCreateAttempt: availability.canCreateAttempt,
      startDate: availability.startDate,
      endDate: availability.endDate,
    },
  };
}

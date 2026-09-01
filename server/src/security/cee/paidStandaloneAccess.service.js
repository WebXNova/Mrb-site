/**
 * Canonical paid-standalone test authorization.
 * Seat + approved order only — never course enrollment / entitlement.
 */

import { mysqlPool } from '../../config/mysql.js';
import { ApiError } from '../../utils/apiError.js';
import { TestNotAccessibleError, TestNotFoundError } from '../../errors/testAttempt/TestAttemptErrors.js';
import { PAID_STANDALONE_ACCESS_TYPE, STANDALONE_ORDER_STATUS, STANDALONE_SEAT_STATUS } from '../../constants/paidStandalone.constants.js';
import {
  assertTestAvailabilityWindowForTest,
  AVAILABILITY_PHASE,
  getAvailabilityNowMs,
} from '../../services/testAvailabilityWindow.service.js';
import { isPublicAccessMode } from './courseLinkedTestAccess.service.js';
import { assertNotBlockedByExamIntegrity } from '../../services/examIntegrity.store.js';

/**
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function isPaidStandaloneTest(testRow) {
  return String(testRow?.test_access_type || '').trim() === PAID_STANDALONE_ACCESS_TYPE;
}

/**
 * Exam-room open: published + access_mode public.
 * Distinct from payment approval / confirmed seat.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function isPaidStandaloneExamOpen(testRow) {
  return (
    isPaidStandaloneTest(testRow) &&
    String(testRow?.status || '') === 'published' &&
    isPublicAccessMode(testRow) &&
    testRow?.deleted_at == null
  );
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {string} slug
 */
export async function loadPaidStandaloneTestBySlug(slug, executor = mysqlPool) {
  const normalized = String(slug || '').trim();
  if (!normalized) return null;
  const [rows] = await executor.query(
    `SELECT id, public_slug, title, description, status, access_mode, test_access_type, course_id,
            price_pkr, seat_capacity, start_date, end_date, duration_minutes, max_attempts, allow_retake,
            shuffle_questions, shuffle_options, passing_marks, negative_marking, layout_mode, display_mode,
            deleted_at
     FROM tests
     WHERE public_slug = ?
       AND test_access_type = ?
       AND course_id IS NULL
       AND deleted_at IS NULL
     LIMIT 1`,
    [normalized, PAID_STANDALONE_ACCESS_TYPE]
  );
  return rows[0] ?? null;
}

/**
 * Confirmed seat + approved order for this student and test.
 *
 * @param {{ testId: number, userId: number, executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }}
 */
export async function loadConfirmedPaidStandaloneSeat({ testId, userId, executor = mysqlPool }) {
  const tid = Number(testId);
  const uid = Number(userId);
  if (!Number.isInteger(tid) || tid <= 0 || !Number.isInteger(uid) || uid <= 0) {
    return null;
  }
  const [rows] = await executor.query(
    `SELECT o.id AS order_id, o.test_id, o.user_id, o.status, o.seat_status, o.amount
     FROM standalone_test_orders o
     WHERE o.test_id = ?
       AND o.user_id = ?
       AND o.status = ?
       AND o.seat_status = ?
     LIMIT 1`,
    [tid, uid, STANDALONE_ORDER_STATUS.APPROVED, STANDALONE_SEAT_STATUS.CONFIRMED]
  );
  return rows[0] ?? null;
}

/**
 * Can start the exam (all required). Approval alone is not enough.
 *
 * @param {{ slug: string, userId: number, phase?: string, nowMs?: number, executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection }}
 */
export async function assertPaidStandaloneTestAccess({
  slug,
  userId,
  phase = AVAILABILITY_PHASE.CREATE_ATTEMPT,
  nowMs,
  executor = mysqlPool,
}) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const test = await loadPaidStandaloneTestBySlug(slug, executor);
  if (!test) {
    throw new TestNotFoundError({ slug, reason: 'paid_standalone_not_found' });
  }

  await assertNotBlockedByExamIntegrity({ testId: Number(test.id), userId: uid, executor });

  const seat = await loadConfirmedPaidStandaloneSeat({
    testId: Number(test.id),
    userId: uid,
    executor,
  });
  if (!seat) {
    throw new TestNotAccessibleError({
      slug,
      userId: uid,
      reason: 'paid_standalone_seat_not_confirmed',
    });
  }

  if (phase !== AVAILABILITY_PHASE.IN_PROGRESS && !isPaidStandaloneExamOpen(test)) {
    throw new TestNotAccessibleError({
      slug,
      userId: uid,
      reason: 'paid_standalone_exam_not_open',
      testId: Number(test.id),
    });
  }

  const clock = nowMs ?? (await getAvailabilityNowMs(executor));
  assertTestAvailabilityWindowForTest(test, {
    phase,
    nowMs: clock,
    context: 'assertPaidStandaloneTestAccess',
  });

  return Object.freeze({
    accessKind: 'paid_standalone',
    paidStandalone: true,
    userId: uid,
    courseId: null,
    test,
    order: seat,
  });
}

/**
 * Canonical free-standalone test authorization.
 * Identity + published public exam + availability window + optional seat cap.
 * Never course enrollment / payment.
 */

import { mysqlPool } from '../../config/mysql.js';
import { ApiError } from '../../utils/apiError.js';
import { TestNotAccessibleError, TestNotFoundError } from '../../errors/testAttempt/TestAttemptErrors.js';
import { TEST_ACCESS_TYPE_FREE_STANDALONE } from '../../constants/testAccessType.constants.js';
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
export function isFreeStandaloneTest(testRow) {
  return String(testRow?.test_access_type || '').trim() === TEST_ACCESS_TYPE_FREE_STANDALONE;
}

/**
 * Exam-room open: published + access_mode public.
 *
 * @param {Record<string, unknown>|null|undefined} testRow
 */
export function isFreeStandaloneExamOpen(testRow) {
  return (
    isFreeStandaloneTest(testRow) &&
    String(testRow?.status || '') === 'published' &&
    isPublicAccessMode(testRow) &&
    testRow?.deleted_at == null
  );
}

/**
 * Distinct occupants of a free-test seat (started or submitted).
 * Authenticated rows count by user; guest rows count individually.
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} testId
 * @param {number} [excludeUserId]
 * @param {string|null} [excludeGuestSessionHash]
 */
export async function countOccupiedFreeStandaloneSeats(
  executor,
  testId,
  excludeUserId,
  excludeGuestSessionHash = null
) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) return 0;
  const exclude = Number(excludeUserId);
  const excludeUser =
    Number.isInteger(exclude) && exclude > 0
      ? 'AND COALESCE(a.user_id, a.student_id) <> ?'
      : '';
  const guestHash = excludeGuestSessionHash ? String(excludeGuestSessionHash) : '';
  const excludeGuest = guestHash ? 'AND a.guest_session_hash <> ?' : '';

  const identifiedParams = excludeUser ? [tid, exclude] : [tid];
  const guestParams = guestHash ? [tid, guestHash] : [tid];

  const [[identified], [guests]] = await Promise.all([
    executor.query(
      `SELECT COUNT(*) AS n
       FROM (
         SELECT DISTINCT COALESCE(a.user_id, a.student_id) AS occupant_id
         FROM test_attempts a
         WHERE a.test_id = ?
           AND a.status IN ('in_progress', 'submitted')
           AND COALESCE(a.user_id, a.student_id) IS NOT NULL
           ${excludeUser}
       ) occupied`,
      identifiedParams
    ),
    executor.query(
      `SELECT COUNT(*) AS n
       FROM test_attempts a
       WHERE a.test_id = ?
         AND a.status IN ('in_progress', 'submitted')
         AND a.user_id IS NULL
         AND a.student_id IS NULL
         ${excludeGuest}`,
      guestParams
    ),
  ]);
  return Number(identified[0]?.n ?? 0) + Number(guests[0]?.n ?? 0);
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {string} slug
 */
export async function loadFreeStandaloneTestBySlug(slug, executor = mysqlPool) {
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
    [normalized, TEST_ACCESS_TYPE_FREE_STANDALONE]
  );
  return rows[0] ?? null;
}

/**
 * Seat cap is optional (0 = unlimited). Same student/guest may resume without a new seat.
 *
 * @param {{
 *   test: Record<string, unknown>,
 *   userId: number,
 *   guestSessionHash?: string|null,
 *   executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection,
 * }} input
 */
export async function assertFreeStandaloneSeatAvailable({
  test,
  userId,
  guestSessionHash = null,
  executor = mysqlPool,
}) {
  const capacity = Number(test?.seat_capacity || 0);
  if (!Number.isInteger(capacity) || capacity <= 0) return;

  const testId = Number(test.id);
  const uid = Number(userId);
  const occupiedExcluding = await countOccupiedFreeStandaloneSeats(
    executor,
    testId,
    uid,
    guestSessionHash
  );
  if (occupiedExcluding >= capacity) {
    throw new TestNotAccessibleError({
      slug: test.public_slug ?? null,
      userId: Number.isInteger(uid) && uid > 0 ? uid : null,
      testId,
      reason: 'free_standalone_seats_full',
    });
  }
}

/**
 * Can start the exam (all required). No payment / course enrollment.
 * Guests pass { guest: true, guestSessionHash } with userId 0.
 *
 * @param {{ slug: string, userId: number, guest?: boolean, guestSessionHash?: string|null, phase?: string, nowMs?: number, executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection, enforceSeats?: boolean }}
 */
export async function assertFreeStandaloneTestAccess({
  slug,
  userId,
  guest = false,
  guestSessionHash = null,
  phase = AVAILABILITY_PHASE.CREATE_ATTEMPT,
  nowMs,
  executor = mysqlPool,
  enforceSeats = true,
}) {
  const uid = Number(userId);
  const isGuest = guest === true || uid === 0;
  if (!isGuest && (!Number.isInteger(uid) || uid <= 0)) {
    throw new ApiError(401, 'Authentication required');
  }

  const test = await loadFreeStandaloneTestBySlug(slug, executor);
  if (!test) {
    throw new TestNotFoundError({ slug, reason: 'free_standalone_not_found' });
  }

  if (!isGuest) {
    await assertNotBlockedByExamIntegrity({ testId: Number(test.id), userId: uid, executor });
  }

  if (phase !== AVAILABILITY_PHASE.IN_PROGRESS && !isFreeStandaloneExamOpen(test)) {
    throw new TestNotAccessibleError({
      slug,
      userId: isGuest ? null : uid,
      reason: 'free_standalone_exam_not_open',
      testId: Number(test.id),
    });
  }

  const clock = nowMs ?? (await getAvailabilityNowMs(executor));
  assertTestAvailabilityWindowForTest(test, {
    phase,
    nowMs: clock,
    context: 'assertFreeStandaloneTestAccess',
  });

  if (enforceSeats && phase === AVAILABILITY_PHASE.CREATE_ATTEMPT) {
    await assertFreeStandaloneSeatAvailable({
      test,
      userId: isGuest ? 0 : uid,
      guestSessionHash: isGuest ? guestSessionHash : null,
      executor,
    });
  }

  return Object.freeze({
    accessKind: 'free_standalone',
    paidStandalone: true,
    standalone: true,
    userId: isGuest ? 0 : uid,
    guest: isGuest,
    courseId: null,
    test,
  });
}

import { mysqlPool } from '../config/mysql.js';
import {
  STANDALONE_ORDER_STATUS,
  STANDALONE_SEAT_STATUS,
} from '../constants/paidStandalone.constants.js';
import {
  loadConfirmedPaidStandaloneSeat,
  loadPaidStandaloneTestBySlug,
} from '../security/cee/paidStandaloneAccess.service.js';
import { loadTestSubjectPresentation } from './testSubjectPresentation.service.js';
import { assertNotBlockedByExamIntegrity } from './examIntegrity.store.js';
import {
  evaluateTestAvailabilityWindow,
  getAvailabilityNowMs,
} from './testAvailabilityWindow.service.js';
import {
  evaluateStandaloneRuntimeState,
} from './standaloneTestRuntimeState.service.js';
import { computeEligiblePrepCanStart, evaluateRetakePolicy } from './testRetakePolicy.service.js';
import { TestNotAccessibleError } from '../errors/testAttempt/TestAttemptErrors.js';

export async function loadPaidStandalonePrep({ slug, studentId }) {
  const uid = Number(studentId);
  const test = await loadPaidStandaloneTestBySlug(slug);
  if (!test || String(test.status) !== 'published') {
    throw new TestNotAccessibleError({ slug, reason: 'paid_standalone_not_found' });
  }
  const testId = Number(test.id);
  const nowMs = await getAvailabilityNowMs(mysqlPool);
  const availability = evaluateTestAvailabilityWindow(test, nowMs);

  const seat = await loadConfirmedPaidStandaloneSeat({
    testId,
    userId: uid,
  });
  const seatConfirmed = Boolean(seat);

  const [countRow] = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM test_attempts WHERE test_id = ? AND (student_id = ? OR user_id = ?)`,
    [testId, uid, uid]
  );
  const attemptsUsed = Number(countRow[0]?.total ?? 0);
  const [activeRow] = await mysqlPool.query(
    `SELECT id FROM test_attempts WHERE test_id = ? AND status = 'in_progress' AND (student_id = ? OR user_id = ?) LIMIT 1`,
    [testId, uid, uid]
  );

  const hasActiveAttempt = Boolean(activeRow[0]);
  const runtime = evaluateStandaloneRuntimeState(test, nowMs);
  const retake = evaluateRetakePolicy(test, { totalAttempts: attemptsUsed, hasActiveAttempt });
  let canStart =
    seatConfirmed &&
    computeEligiblePrepCanStart({
      examOpen: runtime.examOpen,
      availability,
      retake,
      hasActiveAttempt,
    });

  let integrityBlocked = false;
  try {
    await assertNotBlockedByExamIntegrity({ testId, userId: uid });
  } catch {
    integrityBlocked = true;
    canStart = false;
  }

  const unlimited = retake.maxAttempts == null;
  return {
    testId,
    slug: String(test.public_slug),
    title: String(test.title || ''),
    durationMinutes: Number(test.duration_minutes || 0),
    attemptsUsed,
    maxAttempts: unlimited ? null : retake.maxAttempts,
    attemptsRemaining: unlimited ? null : Math.max(0, (retake.maxAttempts ?? 0) - attemptsUsed),
    canStart,
    examOpen: runtime.examOpen,
    listingStatus: runtime.listingStatus,
    schedulePhase: runtime.schedulePhase,
    seatConfirmed,
    hasActiveAttempt,
    availability: {
      notYetAvailable: availability.notYetAvailable,
      noLongerAvailable: availability.noLongerAvailable && !hasActiveAttempt,
      canCreateAttempt: availability.canCreateAttempt,
      startDate: availability.startDate,
      endDate: availability.endDate,
    },
    retakePolicy: {
      canCreateNew: retake.canCreateNew,
      canResumeActive: retake.canResumeActive,
      denyCode: retake.denyCode,
      denyReason: retake.denyReason,
    },
    integrityBlocked,
    accessKind: 'paid_standalone',
  };
}

export async function loadPaidStandalonePublicDetail(slug) {
  const test = await loadPaidStandaloneTestBySlug(slug);
  if (!test || String(test.status) !== 'published') {
    throw new TestNotAccessibleError({ slug, reason: 'paid_standalone_not_found' });
  }
  const [seatRow] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM standalone_test_orders
     WHERE test_id = ? AND status = 'approved' AND seat_status = 'confirmed'`,
    [test.id]
  );
  const [countRow] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ?`,
    [test.id]
  );
  const presentation = await loadTestSubjectPresentation(Number(test.id));
  const capacity = Number(test.seat_capacity || 0);
  const confirmed = Number(seatRow[0]?.n ?? 0);
  const nowMs = await getAvailabilityNowMs(mysqlPool);
  const runtime = evaluateStandaloneRuntimeState(test, nowMs);
  return {
    slug: String(test.public_slug),
    title: String(test.title || ''),
    description: test.description ? String(test.description) : null,
    subject: presentation?.displayLabel || null,
    pricePkr: Number(test.price_pkr || 0),
    seatCapacity: capacity,
    seatsRemaining: Math.max(0, capacity - confirmed),
    questionCount: Number(countRow[0]?.n ?? 0),
    durationMinutes: Number(test.duration_minutes || 0),
    startDate: runtime.startDate,
    endDate: runtime.endDate,
    examOpen: runtime.examOpen,
    listingStatus: runtime.listingStatus,
    schedulePhase: runtime.schedulePhase,
    availability: {
      notYetAvailable: runtime.availability.notYetAvailable,
      noLongerAvailable: runtime.availability.noLongerAvailable,
      canCreateAttempt: runtime.availability.canCreateAttempt,
      startDate: runtime.availability.startDate,
      endDate: runtime.availability.endDate,
    },
    accessKind: 'paid_standalone',
  };
}

/**
 * Own-order status for the paid test page. Does not grant exam access.
 * @param {{ slug: string, studentId: number }}
 */
export async function loadPaidStandaloneMyRegistration({ slug, studentId }) {
  const uid = Number(studentId);
  const detail = await loadPaidStandalonePublicDetail(slug);
  const test = await loadPaidStandaloneTestBySlug(slug);
  const testId = Number(test?.id);

  const [orderRows] = await mysqlPool.query(
    `SELECT id, status, seat_status
     FROM standalone_test_orders
     WHERE test_id = ? AND user_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [testId, uid]
  );
  const order = orderRows[0] ?? null;
  const orderStatus = order ? String(order.status) : null;
  const seatStatus = order ? String(order.seat_status) : STANDALONE_SEAT_STATUS.NONE;
  const seatConfirmed =
    orderStatus === STANDALONE_ORDER_STATUS.APPROVED && seatStatus === STANDALONE_SEAT_STATUS.CONFIRMED;

  let canStart = false;
  let hasActiveAttempt = false;
  let availability = null;
  if (seatConfirmed) {
    try {
      const prep = await loadPaidStandalonePrep({ slug, studentId: uid });
      canStart = Boolean(prep?.canStart);
      hasActiveAttempt = Boolean(prep?.hasActiveAttempt);
      availability = prep?.availability ?? null;
    } catch {
      canStart = false;
    }
  }

  return {
    ...detail,
    orderId: order ? Number(order.id) : null,
    orderStatus,
    seatStatus,
    seatConfirmed,
    canStart,
    hasActiveAttempt,
    availability,
  };
}

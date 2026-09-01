/**
 * Public catalog + prep for free standalone tests. No payment, no course enrollment.
 */

import { mysqlPool } from '../config/mysql.js';
import { TEST_ACCESS_TYPE_FREE_STANDALONE } from '../constants/testAccessType.constants.js';
import {
  assertFreeStandaloneSeatAvailable,
  countOccupiedFreeStandaloneSeats,
  loadFreeStandaloneTestBySlug,
} from '../security/cee/freeStandaloneAccess.service.js';
import { assertNotBlockedByExamIntegrity } from './examIntegrity.store.js';
import { loadTestSubjectPresentation, loadTestSubjectPresentationBatch } from './testSubjectPresentation.service.js';
import {
  evaluateTestAvailabilityWindow,
  getAvailabilityNowMs,
} from './testAvailabilityWindow.service.js';
import {
  STANDALONE_ACTIVE_CATALOG_WHERE_SQL,
  evaluateStandaloneRuntimeState,
  presentStandaloneCatalogRuntime,
} from './standaloneTestRuntimeState.service.js';
import { computeEligiblePrepCanStart, evaluateRetakePolicy } from './testRetakePolicy.service.js';
import { TestNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';
import { attachStandaloneCatalogStudentState } from './standaloneCatalogStudentState.service.js';

function mapCatalogRow(row, presentation, occupied, nowMs) {
  const capacity = Number(row.seat_capacity || 0);
  const seatsRemaining = capacity > 0 ? Math.max(0, capacity - occupied) : null;
  const runtime = presentStandaloneCatalogRuntime(row, nowMs);
  return {
    slug: String(row.public_slug),
    title: String(row.title || ''),
    description: row.description ? String(row.description) : null,
    subject: presentation?.displayLabel || null,
    seatCapacity: capacity,
    seatsRemaining,
    seatsUnlimited: capacity <= 0,
    questionCount: Number(row.question_count || 0),
    durationMinutes: Number(row.duration_minutes || 0),
    startDate: runtime.startDate,
    endDate: runtime.endDate,
    examOpen: runtime.examOpen,
    listingStatus: runtime.listingStatus,
    schedulePhase: runtime.schedulePhase,
    accessKind: 'free_standalone',
  };
}

export async function listFreeStandaloneCatalog({ studentId } = {}) {
  const nowMs = await getAvailabilityNowMs(mysqlPool);
  const [rows] = await mysqlPool.query(
    `SELECT t.id, t.public_slug, t.title, t.description, t.seat_capacity,
            t.start_date, t.end_date, t.duration_minutes, t.access_mode,
            t.status, t.test_access_type, t.deleted_at,
            t.max_attempts, t.results_released_at, t.show_result_immediately,
            (
              SELECT COUNT(*)
              FROM (
                SELECT DISTINCT COALESCE(a.user_id, a.student_id) AS occupant_id
                FROM test_attempts a
                WHERE a.test_id = t.id
                  AND a.status IN ('in_progress', 'submitted')
                  AND COALESCE(a.user_id, a.student_id) IS NOT NULL
              ) occupied
            ) AS occupied_seats,
            (
              SELECT COUNT(*)
              FROM test_questions tq
              INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
              WHERE tq.test_id = t.id
            ) AS question_count
     FROM tests t
     WHERE t.test_access_type = ?
       ${STANDALONE_ACTIVE_CATALOG_WHERE_SQL}
     ORDER BY t.id DESC`,
    [TEST_ACCESS_TYPE_FREE_STANDALONE]
  );
  const listedRows = rows.filter((row) => evaluateStandaloneRuntimeState(row, nowMs).listedInActiveCatalog);
  const presentationByTestId = await loadTestSubjectPresentationBatch(
    listedRows.map((row) => Number(row.id))
  );
  const items = listedRows.map((row) => {
    const presentation = presentationByTestId.get(Number(row.id));
    return mapCatalogRow(row, presentation, Number(row.occupied_seats || 0), nowMs);
  });
  return attachStandaloneCatalogStudentState(items, listedRows, { studentId, kind: 'free' });
}

export async function loadFreeStandalonePublicDetail(slug) {
  const test = await loadFreeStandaloneTestBySlug(slug);
  if (!test || String(test.status) !== 'published') {
    throw new TestNotFoundError({ slug, reason: 'free_standalone_not_found' });
  }
  const occupied = await countOccupiedFreeStandaloneSeats(mysqlPool, Number(test.id));
  const [countRow] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ?`,
    [test.id]
  );
  const presentation = await loadTestSubjectPresentation(Number(test.id));
  const capacity = Number(test.seat_capacity || 0);
  const nowMs = await getAvailabilityNowMs(mysqlPool);
  const runtime = evaluateStandaloneRuntimeState(test, nowMs);
  const availability = runtime.availability;
  const seatsFull = capacity > 0 && occupied >= capacity;
  return {
    slug: String(test.public_slug),
    title: String(test.title || ''),
    description: test.description ? String(test.description) : null,
    subject: presentation?.displayLabel || null,
    seatCapacity: capacity,
    seatsRemaining: capacity > 0 ? Math.max(0, capacity - occupied) : null,
    seatsUnlimited: capacity <= 0,
    seatsFull,
    questionCount: Number(countRow[0]?.n ?? 0),
    durationMinutes: Number(test.duration_minutes || 0),
    startDate: runtime.startDate,
    endDate: runtime.endDate,
    examOpen: runtime.examOpen,
    listingStatus: runtime.listingStatus,
    schedulePhase: runtime.schedulePhase,
    availability: {
      notYetAvailable: availability.notYetAvailable,
      noLongerAvailable: availability.noLongerAvailable,
      canCreateAttempt: availability.canCreateAttempt,
      startDate: availability.startDate,
      endDate: availability.endDate,
    },
    accessKind: 'free_standalone',
  };
}

export async function loadFreeStandalonePrep({ slug, studentId }) {
  const test = await loadFreeStandaloneTestBySlug(slug);
  if (!test || String(test.status) !== 'published') {
    throw new TestNotFoundError({ slug, reason: 'free_standalone_not_found' });
  }
  const testId = Number(test.id);
  const nowMs = await getAvailabilityNowMs(mysqlPool);
  const availability = evaluateTestAvailabilityWindow(test, nowMs);

  const [countRow] = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM test_attempts WHERE test_id = ? AND (student_id = ? OR user_id = ?)`,
    [testId, studentId, studentId]
  );
  const attemptsUsed = Number(countRow[0]?.total ?? 0);
  const [activeRow] = await mysqlPool.query(
    `SELECT id FROM test_attempts WHERE test_id = ? AND status = 'in_progress' AND (student_id = ? OR user_id = ?) LIMIT 1`,
    [testId, studentId, studentId]
  );

  const hasActiveAttempt = Boolean(activeRow[0]);
  const runtime = evaluateStandaloneRuntimeState(test, nowMs);
  const retake = evaluateRetakePolicy(test, { totalAttempts: attemptsUsed, hasActiveAttempt });
  let canStart = computeEligiblePrepCanStart({
    examOpen: runtime.examOpen,
    availability,
    retake,
    hasActiveAttempt,
  });

  let seatsFull = false;
  if (canStart && !hasActiveAttempt) {
    try {
      await assertFreeStandaloneSeatAvailable({ test, userId: studentId });
    } catch {
      seatsFull = true;
      canStart = false;
    }
  }

  let integrityBlocked = false;
  try {
    await assertNotBlockedByExamIntegrity({ testId, userId: studentId });
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
    seatsFull,
    integrityBlocked,
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
    accessKind: 'free_standalone',
  };
}

/**
 * Student instructional portal — entitlement-scoped reads (Phase 1D-B).
 *
 * All dashboard instructional data is bound to the user's single active enrollment.
 * Fail-closed: no global catalog queries, no silent empty fallbacks on auth failures.
 */

import { countStudentQuestions } from './studentQuestions.service.js';
import {
  loadTestSubjectPresentation,
  loadTestSubjectPresentationBatch,
} from './testSubjectPresentation.service.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { toCourseStudentDto } from '../dto/course.dto.js';
import { toCourseBatchPublicDto } from '../dto/courseBatch.dto.js';
import { parseBatchTimestamp } from '../utils/batchDateTime.js';
import {
  assertCourseAccess,
  assertEntitlementGrantable,
  resolveActiveEntitlement,
} from './entitlement.service.js';
import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import {
  CourseNotAccessibleError,
  EnrollmentNotFoundError,
} from '../errors/entitlement/EntitlementErrors.js';
import { AttemptNotFoundError } from '../errors/testAttempt/TestAttemptErrors.js';
import { assertResultOwnership } from '../security/cee/ownership/ownershipValidation.js';
import { getResult as fetchAuthorizedResult } from '../result/result.service.js';
import {
  mapPortalAnswersToLegacyDetails,
  redactStudentResultListItem,
} from './testResultVisibility.service.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';
import { buildCourseProgressSummary, loadCompletedLectureIdSet } from './lectureProgress.service.js';
import { computeLectureLockStates } from './lectureGating.service.js';
import { recordAndGetLearningStreak } from './studentStreak.service.js';

/**
 * Resolve and validate entitlement for dashboard instructional delivery.
 * @param {number} studentId
 * @returns {Promise<import('./entitlement.service.js').EntitlementContext>}
 */
async function requireDashboardEntitlement(studentId) {
  const entitlement = await resolveActiveEntitlement(studentId);

  if (!entitlement) {
    throw new EnrollmentNotFoundError({ userId: studentId, context: 'student_dashboard' });
  }

  assertEntitlementGrantable(entitlement, { userId: studentId, courseId: entitlement.courseId });

  return entitlement;
}

/**
 * @param {number} courseId — entitled course only
 */
async function loadEntitledCourse(courseId) {
  const row = await getCourseRowById(courseId, { activeOnly: true });
  if (!row) {
    throw new CourseNotAccessibleError({
      courseId,
      reason: 'course_inactive_or_missing',
      context: 'student_dashboard',
    });
  }
  const dto = toCourseStudentDto(row);
  if (!dto) {
    throw new CourseNotAccessibleError({
      courseId,
      reason: 'course_dto_invalid',
      context: 'student_dashboard',
    });
  }
  return dto;
}

/**
 * Lectures for entitled course with full hierarchy (no orphan chapter_id NULL rows).
 * When studentId is provided, applies batch + sequential gating metadata on each row.
 * @param {number} courseId
 * @param {number|null} [studentId]
 */
async function loadEntitledLectures(courseId, studentId = null, { includeMedia = true } = {}) {
  const mediaSelect = includeMedia ? 'l.youtube_url,' : 'NULL AS youtube_url,';
  const sql = `
    SELECT l.id, l.course_id, l.chapter_id, l.title, ${mediaSelect} l.topic, l.sort_order,
            c.title AS course_title,
            ch.title AS chapter_title,
            ch.order_index AS chapter_order_index,
            s.id AS subject_id,
            s.title AS subject_title,
            s.order_index AS subject_order_index
     FROM lectures l
     INNER JOIN courses c ON c.id = l.course_id AND c.is_active = TRUE
     INNER JOIN chapters ch ON ch.id = l.chapter_id AND ch.is_active = TRUE
     INNER JOIN subjects s ON s.id = ch.subject_id AND s.course_id = l.course_id AND s.is_active = TRUE
     WHERE l.course_id = ?
       AND l.is_active = TRUE
     ORDER BY s.order_index ASC, ch.order_index ASC, l.sort_order ASC, l.created_at ASC`;

  const db = scopedQuery({ courseId, context: 'studentPortal.loadEntitledLectures' });
  const rows = await db.rows(sql, [courseId]);

  if (!studentId) return rows;

  const [batchRow, completedIds] = await Promise.all([
    fetchEntitledCourseBatchRow(courseId),
    loadCompletedLectureIdSet(studentId, courseId),
  ]);

  const lockStates = computeLectureLockStates(rows, { batch: batchRow, completedIds });

  return rows.map((row) => {
    const state = lockStates.get(Number(row.id)) || { locked: false, unlockReason: null };
    return {
      ...row,
      _locked: state.locked,
      _unlockReason: state.unlockReason,
    };
  });
}

/**
 * Course-scoped published tests for entitled dashboard (CEE).
 * @param {number} courseId
 * @param {{ includeSubjectPresentation?: boolean }} [opts]
 */
async function loadEntitledTests(courseId, { includeSubjectPresentation = true } = {}) {
  const db = scopedQuery({ courseId, context: 'studentPortal.loadEntitledTests' });
  const rows = await db.rows(
    `SELECT id, title, category, test_type, duration_minutes, max_attempts, public_slug
     FROM tests
     WHERE course_id = ? AND status = 'published'
     ORDER BY updated_at DESC`,
    [courseId]
  );
  if (!includeSubjectPresentation) {
    return rows.map((row) => ({
      ...row,
      subject_label: null,
      subject_ids: [],
    }));
  }
  const { loadTestSubjectPresentationBatch } = await import('./testSubjectPresentation.service.js');
  const presentationByTestId = await loadTestSubjectPresentationBatch(rows.map((row) => Number(row.id)));
  return rows.map((row) => {
    const presentation = presentationByTestId.get(Number(row.id));
    return {
      ...row,
      subject_label: presentation?.displayLabel ?? null,
      subject_ids: presentation?.subjectIds ?? [],
    };
  });
}

/**
 * Entitlement-scoped results — course_id + user_id (no cross-course leakage).
 * Bounded for dashboard payloads; full history lives on result detail / listing endpoints.
 * @param {number} studentId
 * @param {number} courseId
 * @param {{ limit?: number }} [opts]
 */
async function loadEntitledStudentResults(studentId, courseId, { limit = 25 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const db = scopedQuery({
    courseId,
    context: 'studentPortal.loadEntitledStudentResults',
    userId: studentId,
  });
  return db.rows(
    `SELECT a.id AS attempt_id, t.title AS test_title, t.public_slug, t.results_released_at,
            t.show_result_immediately,
            a.submitted_at, r.score, r.max_score, r.percentage,
            ${DERIVED_PASS_STATUS_SQL} AS pass_status
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     WHERE a.user_id = ?
     ORDER BY a.submitted_at DESC
     LIMIT ?`,
    [courseId, studentId, safeLimit]
  );
}

/**
 * @param {number} studentId
 * @param {number} courseId
 * @returns {Promise<number|null>}
 */
async function loadEntitledStudentResultsAverage(studentId, courseId) {
  const db = scopedQuery({
    courseId,
    context: 'studentPortal.loadEntitledStudentResultsAverage',
    userId: studentId,
  });
  const rows = await db.rows(
    `SELECT AVG(r.percentage) AS avg_percentage
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     WHERE a.user_id = ?
       AND r.percentage IS NOT NULL`,
    [courseId, studentId]
  );
  const avg = Number(rows[0]?.avg_percentage);
  return Number.isFinite(avg) ? Math.round(avg) : null;
}

function mapLectureRow(row, completedIds = null, { includeMedia = true } = {}) {
  const lectureId = Number(row.id);
  const locked = Boolean(row._locked);
  const unlockReason = row._unlockReason != null ? String(row._unlockReason) : null;
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    chapterId: Number(row.chapter_id),
    chapterTitle: String(row.chapter_title),
    subjectId: Number(row.subject_id),
    subjectTitle: String(row.subject_title),
    title: row.title,
    youtubeUrl: includeMedia && !locked ? row.youtube_url ?? null : null,
    topic: row.topic,
    sortOrder: row.sort_order,
    completed: completedIds ? completedIds.has(lectureId) : false,
    locked,
    unlockReason,
  };
}

function mapTestRow(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? 'MDCAT',
    testType: row.test_type ?? 'subject_wise',
    subject: row.subject_label ?? null,
    subjectIds: row.subject_ids ?? [],
    durationMinutes: row.duration_minutes ?? null,
    maxAttempts: row.max_attempts ?? null,
    slug: row.public_slug ?? null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Active batch row for an entitled course (raw DB row for gating + DTO mapping).
 * @param {number} courseId
 */
async function fetchEntitledCourseBatchRow(courseId) {
  const db = scopedQuery({ courseId, context: 'studentPortal.fetchEntitledCourseBatchRow' });
  const rows = await db.rows(
    `SELECT id, course_id, title, code, start_date, end_date, enrollment_open_at, enrollment_close_at,
            total_seats, seats_filled, instructor_name, schedule_label, timezone, status,
            is_active, show_publicly, recordings_enabled,
            sequential_lectures_enabled, created_at, updated_at
     FROM course_batches
     WHERE course_id = ? AND is_active = TRUE
     ORDER BY start_date ASC, id ASC
     LIMIT 1`,
    [courseId]
  );
  return rows[0] ?? null;
}

/**
 * Active batch for an entitled course (student may see batch even when not publicly listed).
 * @param {number} courseId
 */
async function loadEntitledCourseBatch(courseId) {
  const row = await fetchEntitledCourseBatchRow(courseId);
  return row ? toCourseBatchPublicDto(row) : null;
}

/**
 * @param {number} enrollmentId
 * @param {number} courseId
 * @param {number} studentId
 */
async function loadEntitledEnrollmentMeta(enrollmentId, courseId, studentId) {
  const db = scopedQuery({
    courseId,
    userId: studentId,
    context: 'studentPortal.loadEntitledEnrollmentMeta',
  });
  const rows = await db.rows(
    `SELECT id, status, access_status, created_at, reviewed_at
     FROM enrollments
     WHERE id = ? AND course_id = ? AND user_id = ?
     LIMIT 1`,
    [enrollmentId, courseId, studentId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    status: String(row.status || ''),
    accessStatus: String(row.access_status || ''),
    enrolledAt: row.created_at ?? null,
    reviewedAt: row.reviewed_at ?? null,
  };
}

async function loadEntitledSubjectCount(courseId) {
  const db = scopedQuery({ courseId, context: 'studentPortal.loadEntitledSubjectCount' });
  const rows = await db.rows(
    `SELECT COUNT(*) AS c FROM subjects WHERE course_id = ? AND is_active = TRUE`,
    [courseId]
  );
  return Number(rows[0]?.c || 0);
}

async function loadEntitledChapterCount(courseId) {
  const db = scopedQuery({ courseId, context: 'studentPortal.loadEntitledChapterCount' });
  const rows = await db.rows(
    `SELECT COUNT(*) AS c
     FROM chapters ch
     INNER JOIN subjects s ON s.id = ch.subject_id AND s.course_id = ?
     WHERE ch.is_active = TRUE AND s.is_active = TRUE`,
    [courseId]
  );
  return Number(rows[0]?.c || 0);
}

/**
 * @param {ReturnType<typeof toCourseBatchPublicDto>|null} batch
 */
function computeCourseSchedule(batch) {
  if (!batch?.start_date || !batch?.end_date) {
    return {
      startDate: batch?.start_date ?? null,
      endDate: batch?.end_date ?? null,
      enrollmentOpenAt: batch?.enrollment_open_at ?? null,
      enrollmentCloseAt: batch?.enrollment_close_at ?? null,
      scheduleLabel: batch?.schedule_label ?? null,
      instructorName: batch?.instructor_name ?? null,
      timezone: batch?.timezone ?? 'UTC',
      batchTitle: batch?.title ?? null,
      batchStatus: batch?.status ?? null,
      phase: 'no_schedule',
      daysRemaining: null,
      daysElapsed: null,
      totalDays: null,
    };
  }

  const now = new Date();
  const startMs = parseBatchTimestamp(batch.start_date);
  const endMs = parseBatchTimestamp(batch.end_date);
  const start = new Date(startMs);
  const end = new Date(endMs);
  const totalDays = Math.max(1, Math.ceil((endMs - startMs) / DAY_MS));

  let phase = 'in_progress';
  let daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  let daysElapsed = Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));

  if (now < start) {
    phase = 'upcoming';
    daysElapsed = 0;
  } else if (now > end) {
    phase = 'completed';
    daysRemaining = 0;
    daysElapsed = totalDays;
  }

  return {
    startDate: batch.start_date,
    endDate: batch.end_date,
    enrollmentOpenAt: batch.enrollment_open_at ?? null,
    enrollmentCloseAt: batch.enrollment_close_at ?? null,
    scheduleLabel: batch.schedule_label ?? null,
    instructorName: batch.instructor_name ?? null,
    timezone: batch.timezone ?? 'UTC',
    batchTitle: batch.title ?? null,
    batchStatus: batch.status ?? null,
    phase,
    daysRemaining,
    daysElapsed: Math.min(daysElapsed, totalDays),
    totalDays,
  };
}

function mapProgressPayload(summary) {
  return {
    percent: summary.percent,
    lecturesPercent: summary.lecturesPercent,
    testsPercent: summary.testsPercent,
    lecturesCompleted: summary.lecturesCompleted,
    lecturesTotal: summary.lecturesTotal,
    testsCompleted: summary.testsCompleted,
    testsTotal: summary.testsTotal,
    completedLectureIds: summary.completedLectureIds,
  };
}

/**
 * Entitlement-scoped student dashboard. Requires active paid enrollment.
 * @param {number} studentId
 */
export async function getStudentDashboard(studentId) {
  const entitlement = await requireDashboardEntitlement(studentId);
  const courseId = entitlement.courseId;

  const [course, lecturesRows, tests, results, questionsAsked, progressSummary, streak, batchRow, averageTestScore] =
    await Promise.all([
      loadEntitledCourse(courseId),
      loadEntitledLectures(courseId, null, { includeMedia: false }),
      // Dashboard search only needs titles/slugs — skip subject presentation batch.
      loadEntitledTests(courseId, { includeSubjectPresentation: false }),
      loadEntitledStudentResults(studentId, courseId, { limit: 25 }),
      countStudentQuestions(studentId),
      buildCourseProgressSummary(studentId, courseId),
      recordAndGetLearningStreak(studentId),
      fetchEntitledCourseBatchRow(courseId),
      loadEntitledStudentResultsAverage(studentId, courseId),
    ]);

  const completedIds = new Set(progressSummary.completedLectureIds);
  const lockStates = computeLectureLockStates(lecturesRows || [], {
    batch: batchRow,
    completedIds,
  });
  const lecturesWithLocks = (lecturesRows || []).map((row) => {
    const state = lockStates.get(Number(row.id)) || { locked: false, unlockReason: null };
    return {
      ...row,
      _locked: state.locked,
      _unlockReason: state.unlockReason,
    };
  });
  const progress = mapProgressPayload(progressSummary);

  return {
    entitlement: {
      enrollmentId: entitlement.enrollmentId,
      courseId: entitlement.courseId,
      accessStatus: entitlement.accessStatus,
      enrollmentStatus: entitlement.enrollmentStatus,
    },
    /** Single entitled course only (array for existing client normalisers). */
    courses: [course],
    course,
    // Lean lectures: no youtube URLs (player loads GET /student/lectures).
    lectures: lecturesWithLocks.map((row) => mapLectureRow(row, completedIds, { includeMedia: false })),
    tests: (tests || []).map(mapTestRow),
    results: (results || []).map((row) => {
      const redacted = redactStudentResultListItem(row);
      return {
        attemptId: row.attempt_id,
        testTitle: row.test_title,
        slug: row.public_slug,
        submittedAt: row.submitted_at,
        resultAvailable: redacted.resultAvailable,
        score: redacted.score,
        maxScore: redacted.maxScore,
        percentage: redacted.percentage,
        status: redacted.status,
      };
    }),
    resultsCount: progress.testsCompleted,
    questionsAsked: Number(questionsAsked) || 0,
    progress,
    progressPercent: progress.percent,
    testsCompleted: progress.testsCompleted,
    lecturesCompleted: progress.lecturesCompleted,
    averageTestScore,
    streak,
    recentActivity: [],
    notifications: [],
  };
}

/**
 * Full entitled lecture list for the lectures player (includes playable media URLs).
 * Dashboard returns lean lectures without youtubeUrl — use this for playback.
 * @param {number} studentId
 */
export async function getStudentLectures(studentId) {
  const entitlement = await requireDashboardEntitlement(studentId);
  const courseId = entitlement.courseId;

  const [lecturesRows, progressSummary, batchRow] = await Promise.all([
    loadEntitledLectures(courseId, null, { includeMedia: true }),
    buildCourseProgressSummary(studentId, courseId),
    fetchEntitledCourseBatchRow(courseId),
  ]);

  const completedIds = new Set(progressSummary.completedLectureIds);
  const lockStates = computeLectureLockStates(lecturesRows || [], {
    batch: batchRow,
    completedIds,
  });
  const lecturesWithLocks = (lecturesRows || []).map((row) => {
    const state = lockStates.get(Number(row.id)) || { locked: false, unlockReason: null };
    return {
      ...row,
      _locked: state.locked,
      _unlockReason: state.unlockReason,
    };
  });

  return {
    lectures: lecturesWithLocks.map((row) => mapLectureRow(row, completedIds, { includeMedia: true })),
    progress: mapProgressPayload(progressSummary),
  };
}

/**
 * Rich course overview for the student portal "My Course" page.
 * @param {number} studentId
 */
export async function getStudentMyCourse(studentId) {
  const entitlement = await requireDashboardEntitlement(studentId);
  const courseId = entitlement.courseId;

  const [
    course,
    batchRow,
    enrollment,
    questionsAsked,
    subjectsTotal,
    chaptersTotal,
    progressSummary,
    averageTestScore,
  ] = await Promise.all([
    loadEntitledCourse(courseId),
    fetchEntitledCourseBatchRow(courseId),
    loadEntitledEnrollmentMeta(entitlement.enrollmentId, courseId, studentId),
    countStudentQuestions(studentId),
    loadEntitledSubjectCount(courseId),
    loadEntitledChapterCount(courseId),
    buildCourseProgressSummary(studentId, courseId),
    loadEntitledStudentResultsAverage(studentId, courseId),
  ]);

  const batch = batchRow ? toCourseBatchPublicDto(batchRow) : null;
  const schedule = computeCourseSchedule(batch);
  const progress = mapProgressPayload(progressSummary);

  return {
    entitlement: {
      enrollmentId: entitlement.enrollmentId,
      courseId: entitlement.courseId,
      accessStatus: entitlement.accessStatus,
      enrollmentStatus: entitlement.enrollmentStatus,
    },
    course,
    batch,
    enrollment,
    schedule,
    stats: {
      lecturesTotal: progress.lecturesTotal,
      lecturesCompleted: progress.lecturesCompleted,
      testsTotal: progress.testsTotal,
      testsCompleted: progress.testsCompleted,
      questionsAsked: Number(questionsAsked) || 0,
      subjectsTotal,
      chaptersTotal,
      resultsCount: progress.testsCompleted,
      averageTestScore,
    },
    progress,
    progressPercent: progress.percent,
    testsCompleted: progress.testsCompleted,
    lecturesCompleted: progress.lecturesCompleted,
    features: {
      recordingsEnabled: batch?.recordings_enabled !== false,
    },
  };
}

export async function getStudentResultByAttempt(studentId, attemptId, entitledCourseId) {
  const entitlement = await assertCourseAccess(studentId, entitledCourseId);
  await assertResultOwnership({
    attemptId,
    userId: studentId,
    entitlement,
    context: 'studentPortal.getStudentResultByAttempt',
  });

  const data = await fetchAuthorizedResult(studentId, attemptId);
  const subjectPresentation = await loadTestSubjectPresentation(Number(data.test_id));
  const details = mapPortalAnswersToLegacyDetails(data.answers);

  return {
    resultId: data.result_id,
    testTitle: data.test_title,
    subject: subjectPresentation.displayLabel,
    submittedAt: data.submitted_at,
    score: data.summary.score,
    maxScore: data.summary.max_score,
    percentage: data.summary.percentage,
    correctCount: data.summary.correct_answers,
    wrongCount: data.summary.wrong_answers,
    skippedCount: data.summary.unanswered_answers,
    timeTakenSeconds: data.summary.time_taken_seconds,
    status: data.summary.status,
    ...(details ? { details } : {}),
    ...(data.score_band_message_html ? { scoreBandMessageHtml: data.score_band_message_html } : {}),
    visibility: data.visibility,
  };
}

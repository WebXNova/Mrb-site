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
import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { toCoursePublicDto } from '../dto/course.dto.js';
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
  const dto = toCoursePublicDto(row);
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
 * @param {number} courseId
 */
async function loadEntitledLectures(courseId) {
  const sql = `
    SELECT l.id, l.course_id, l.chapter_id, l.title, l.youtube_url, l.topic, l.sort_order,
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
  return db.rows(sql, [courseId]);
}

/**
 * Course-scoped published tests for entitled dashboard (CEE).
 * @param {number} courseId
 */
async function loadEntitledTests(courseId) {
  const db = scopedQuery({ courseId, context: 'studentPortal.loadEntitledTests' });
  const rows = await db.rows(
    `SELECT id, title, category, test_type, duration_minutes, max_attempts, public_slug
     FROM tests
     WHERE course_id = ? AND status = 'published'
     ORDER BY updated_at DESC`,
    [courseId]
  );
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
 * @param {number} studentId
 * @param {number} courseId
 */
async function loadEntitledStudentResults(studentId, courseId) {
  const db = scopedQuery({
    courseId,
    context: 'studentPortal.loadEntitledStudentResults',
    userId: studentId,
  });
  return db.rows(
    `SELECT a.id AS attempt_id, t.title AS test_title, t.public_slug, a.submitted_at,
            r.score, r.max_score, r.percentage
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     WHERE a.user_id = ?
     ORDER BY a.submitted_at DESC`,
    [courseId, studentId]
  );
}

function mapLectureRow(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    chapterId: Number(row.chapter_id),
    chapterTitle: String(row.chapter_title),
    subjectId: Number(row.subject_id),
    subjectTitle: String(row.subject_title),
    title: row.title,
    youtubeUrl: row.youtube_url,
    topic: row.topic,
    sortOrder: row.sort_order,
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

/**
 * Entitlement-scoped student dashboard. Requires active paid enrollment.
 * @param {number} studentId
 */
export async function getStudentDashboard(studentId) {
  const entitlement = await requireDashboardEntitlement(studentId);
  const courseId = entitlement.courseId;

  const [course, lecturesRows, tests, results, questionsAsked] = await Promise.all([
    loadEntitledCourse(courseId),
    loadEntitledLectures(courseId),
    loadEntitledTests(courseId),
    loadEntitledStudentResults(studentId, courseId),
    countStudentQuestions(studentId),
  ]);

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
    lectures: (lecturesRows || []).map(mapLectureRow),
    tests: (tests || []).map(mapTestRow),
    results: (results || []).map((row) => ({
      attemptId: row.attempt_id,
      testTitle: row.test_title,
      slug: row.public_slug,
      submittedAt: row.submitted_at,
      score: row.score,
      maxScore: row.max_score,
      percentage: row.percentage,
    })),
    questionsAsked: Number(questionsAsked) || 0,
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

  const db = scopedQuery({
    courseId: entitlement.courseId,
    context: 'studentPortal.getStudentResultByAttempt',
    userId: studentId,
  });

  const rows = await db.rows(
    `SELECT r.id, r.score, r.max_score, r.percentage, r.correct_count, r.wrong_count, r.skipped_count, r.time_taken_seconds, r.detail_json,
            t.title AS test_title, t.id AS test_id
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ? AND t.course_id IS NOT NULL
     WHERE a.id = ? AND a.user_id = ? AND a.status = 'submitted'
     LIMIT 1`,
    [entitlement.courseId, attemptId, studentId]
  );

  const row = rows[0];
  if (!row) {
    throw new AttemptNotFoundError({
      attemptId,
      userId: studentId,
      courseId: entitlement.courseId,
      context: 'submitted_result_missing',
    });
  }
  const subjectPresentation = await loadTestSubjectPresentation(Number(row.test_id));

  return {
    resultId: row.id,
    testTitle: row.test_title,
    subject: subjectPresentation.displayLabel,
    score: row.score,
    maxScore: row.max_score,
    percentage: row.percentage,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    skippedCount: row.skipped_count,
    timeTakenSeconds: row.time_taken_seconds,
    details: JSON.parse(row.detail_json || '[]').map((item) => ({
      ...item,
      questionText: sanitizeRichHtml(item.questionText),
      explanation: sanitizeRichHtml(item.explanation),
    })),
  };
}

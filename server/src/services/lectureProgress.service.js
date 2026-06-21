/**
 * Student lecture completion progress — entitlement-scoped writes and reads.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { assertCourseAccess } from './entitlement.service.js';
import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import {
  fetchCourseBatchRowForGating,
  fetchOrderedLectureRows,
  getLectureLockState,
} from './lectureGating.service.js';

const COMPLETED_STATUS = 'completed';

/**
 * Verify lecture is part of the entitled course catalog (active hierarchy).
 * @param {number} lectureId
 * @param {number} courseId
 */
async function assertEntitledLecture(lectureId, courseId) {
  const db = scopedQuery({ courseId, context: 'lectureProgress.assertEntitledLecture' });
  const rows = await db.rows(
    `SELECT l.id, l.course_id
     FROM lectures l
     INNER JOIN courses c ON c.id = l.course_id AND c.is_active = TRUE
     INNER JOIN chapters ch ON ch.id = l.chapter_id AND ch.is_active = TRUE
     INNER JOIN subjects s ON s.id = ch.subject_id AND s.course_id = l.course_id AND s.is_active = TRUE
     WHERE l.id = ?
       AND l.course_id = ?
       AND l.is_active = TRUE
     LIMIT 1`,
    [lectureId, courseId]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'Lecture not found or not available in your course.', {
      code: 'LECTURE_NOT_FOUND',
    });
  }
  return rows[0];
}

/**
 * @param {number} studentId
 * @param {number} courseId
 * @returns {Promise<Set<number>>}
 */
export async function loadCompletedLectureIdSet(studentId, courseId) {
  const db = scopedQuery({
    courseId,
    userId: studentId,
    context: 'lectureProgress.loadCompletedLectureIdSet',
  });
  const rows = await db.rows(
    `SELECT lecture_id
     FROM lecture_progress
     WHERE user_id = ? AND course_id = ? AND status = ?`,
    [studentId, courseId, COMPLETED_STATUS]
  );
  return new Set(rows.map((row) => Number(row.lecture_id)));
}

/**
 * @param {number} studentId
 * @param {number} courseId
 */
export async function countCompletedLectures(studentId, courseId) {
  const db = scopedQuery({
    courseId,
    userId: studentId,
    context: 'lectureProgress.countCompletedLectures',
  });
  const rows = await db.rows(
    `SELECT COUNT(*) AS c
     FROM lecture_progress
     WHERE user_id = ? AND course_id = ? AND status = ?`,
    [studentId, courseId, COMPLETED_STATUS]
  );
  return Number(rows[0]?.c || 0);
}

/**
 * @param {number} studentId
 * @param {number} lectureId
 * @param {number} entitledCourseId
 */
export async function markLectureComplete(studentId, lectureId, entitledCourseId) {
  await assertCourseAccess(studentId, entitledCourseId);
  await assertEntitledLecture(lectureId, entitledCourseId);

  const [orderedRows, batchRow, completedIds] = await Promise.all([
    fetchOrderedLectureRows(entitledCourseId),
    fetchCourseBatchRowForGating(entitledCourseId),
    loadCompletedLectureIdSet(studentId, entitledCourseId),
  ]);
  const lock = getLectureLockState(lectureId, orderedRows, { batch: batchRow, completedIds });
  if (lock.locked) {
    throw new ApiError(403, lock.unlockReason || 'This lecture is locked.', { code: 'LECTURE_LOCKED' });
  }

  const [existing] = await mysqlPool.query(
    `SELECT id, status, completed_at
     FROM lecture_progress
     WHERE user_id = ? AND lecture_id = ?
     LIMIT 1`,
    [studentId, lectureId]
  );

  if (existing[0]) {
    return {
      id: Number(existing[0].id),
      lectureId,
      courseId: entitledCourseId,
      status: String(existing[0].status),
      completedAt: existing[0].completed_at,
      created: false,
    };
  }

  const [result] = await mysqlPool.query(
    `INSERT INTO lecture_progress (user_id, lecture_id, course_id, status, completed_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [studentId, lectureId, entitledCourseId, COMPLETED_STATUS]
  );

  const [rows] = await mysqlPool.query(
    `SELECT id, status, completed_at FROM lecture_progress WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  const row = rows[0];

  return {
    id: Number(row.id),
    lectureId,
    courseId: entitledCourseId,
    status: String(row.status),
    completedAt: row.completed_at,
    created: true,
  };
}

/**
 * Build course progress summary for entitled student.
 * @param {number} studentId
 * @param {number} courseId
 */
export async function buildCourseProgressSummary(studentId, courseId) {
  await assertCourseAccess(studentId, courseId);

  const db = scopedQuery({ courseId, context: 'lectureProgress.buildCourseProgressSummary' });

  const [lectureCountRows, testCountRows, resultCountRows, completedSet] = await Promise.all([
    db.rows(
      `SELECT COUNT(*) AS c
       FROM lectures l
       INNER JOIN chapters ch ON ch.id = l.chapter_id AND ch.is_active = TRUE
       INNER JOIN subjects s ON s.id = ch.subject_id AND s.course_id = l.course_id AND s.is_active = TRUE
       WHERE l.course_id = ? AND l.is_active = TRUE`,
      [courseId]
    ),
    db.rows(
      `SELECT COUNT(*) AS c FROM tests WHERE course_id = ? AND status = 'published'`,
      [courseId]
    ),
    scopedQuery({
      courseId,
      userId: studentId,
      context: 'lectureProgress.buildCourseProgressSummary.results',
    }).rows(
      `SELECT COUNT(*) AS c
       FROM test_attempts a
       INNER JOIN test_results r ON r.attempt_id = a.id
       INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
       WHERE a.user_id = ?`,
      [courseId, studentId]
    ),
    loadCompletedLectureIdSet(studentId, courseId),
  ]);

  const lecturesTotal = Number(lectureCountRows[0]?.c || 0);
  const lecturesCompleted = completedSet.size;
  const testsTotal = Number(testCountRows[0]?.c || 0);
  const testsCompleted = Number(resultCountRows[0]?.c || 0);

  const lecturesPercent =
    lecturesTotal > 0 ? Math.min(100, Math.round((lecturesCompleted / lecturesTotal) * 100)) : 0;
  const testsPercent =
    testsTotal > 0 ? Math.min(100, Math.round((testsCompleted / testsTotal) * 100)) : 0;

  const components = [];
  if (lecturesTotal > 0) components.push(lecturesPercent);
  if (testsTotal > 0) components.push(testsPercent);
  const percent =
    components.length > 0
      ? Math.min(100, Math.round(components.reduce((sum, v) => sum + v, 0) / components.length))
      : 0;

  return {
    courseId,
    lecturesTotal,
    lecturesCompleted,
    lecturesPercent,
    testsTotal,
    testsCompleted,
    testsPercent,
    percent,
    completedLectureIds: [...completedSet].sort((a, b) => a - b),
  };
}

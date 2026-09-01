/**
 * Course leaderboard — ranked by average released/graded percentage.
 * Student reads are entitlement-scoped; names are masked in the DTO layer.
 */

import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import { ApiError } from '../utils/apiError.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';
import {
  toAdminAttemptDetail,
  toAdminEnrollmentDetail,
  toAdminLeaderboardEntry,
  toStudentLeaderboardEntry,
} from '../dto/courseLeaderboard.dto.js';

/** Same visibility rule as student Results / test history. */
const RESULT_VISIBLE_SQL = `(t.results_released_at IS NOT NULL OR t.show_result_immediately = 1)`;

const MAX_LEADERBOARD_ROWS = 500;
const MAX_DETAIL_ATTEMPTS = 200;

const RANKING_FROM_SQL = `
  FROM test_results r
  INNER JOIN test_attempts a
    ON a.id = r.attempt_id
   AND a.status = 'submitted'
   AND COALESCE(a.user_id, a.student_id) = r.student_id
  INNER JOIN tests t
    ON t.id = r.test_id
   AND t.course_id = ?
   AND t.deleted_at IS NULL
  LEFT JOIN enrollments e
    ON e.user_id = r.student_id
   AND e.course_id = ?
  LEFT JOIN users u
    ON u.id = r.student_id
  WHERE r.course_id = ?
    AND ${RESULT_VISIBLE_SQL}
`;

/**
 * @param {unknown} value
 * @returns {number}
 */
function asPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * @param {number} courseId
 * @param {{ userId?: number, context: string }} options
 */
async function loadCourseRow(courseId, { userId = null, context }) {
  const db = scopedQuery({ courseId, context, userId: userId || undefined });
  const row = await db.first(`SELECT id, title FROM courses WHERE id = ? LIMIT 1`, [courseId]);
  return row;
}

/**
 * @param {number} courseId
 * @param {{ userId?: number, context: string }} options
 */
async function loadRankingRows(courseId, { userId = null, context }) {
  const db = scopedQuery({ courseId, context, userId: userId || undefined });
  return db.rows(
    `SELECT
       r.student_id AS student_id,
       AVG(r.percentage) AS average_score,
       COUNT(*) AS tests_taken,
       MAX(r.percentage) AS highest_score,
       MIN(r.percentage) AS lowest_score,
       COALESCE(MAX(e.applicant_full_name), MAX(u.full_name), '') AS full_name
     ${RANKING_FROM_SQL}
     GROUP BY r.student_id
     ORDER BY average_score DESC, tests_taken DESC, r.student_id ASC
     LIMIT ?`,
    [courseId, courseId, courseId, MAX_LEADERBOARD_ROWS]
  );
}

/**
 * Student leaderboard for an entitled course. Masked names only; no student ids.
 *
 * @param {number} courseId
 * @param {number} currentStudentId
 */
export async function getStudentCourseLeaderboard(courseId, currentStudentId) {
  const cid = asPositiveInt(courseId);
  const uid = asPositiveInt(currentStudentId);
  if (!cid || !uid) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }

  const course = await loadCourseRow(cid, {
    userId: uid,
    context: 'courseLeaderboard.student.course',
  });
  const rows = await loadRankingRows(cid, {
    userId: uid,
    context: 'courseLeaderboard.student.rank',
  });

  const entries = rows.map((row, index) =>
    toStudentLeaderboardEntry({
      rank: index + 1,
      displayName: row.full_name,
      averageScore: row.average_score,
      testsTaken: row.tests_taken,
      isCurrentStudent: Number(row.student_id) === uid,
    })
  );

  return {
    courseId: cid,
    courseTitle: String(course?.title ?? ''),
    entries,
  };
}

/**
 * Student board for the single current active enrollment — never a course picker.
 *
 * @param {number} currentStudentId
 */
export async function getStudentCurrentCourseLeaderboard(currentStudentId) {
  const uid = asPositiveInt(currentStudentId);
  if (!uid) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }
  const entitlement = await requireEntitlement(uid);
  return getStudentCourseLeaderboard(entitlement.courseId, uid);
}

/**
 * Admin leaderboard — full names, student ids, high/low. Same ranking as students.
 *
 * @param {number} courseId
 * @param {number} [adminUserId]
 */
export async function getAdminCourseLeaderboard(courseId, adminUserId = null) {
  const cid = asPositiveInt(courseId);
  if (!cid) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }

  const course = await loadCourseRow(cid, {
    userId: asPositiveInt(adminUserId) || undefined,
    context: 'courseLeaderboard.admin.course',
  });
  if (!course) {
    throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  }

  const rows = await loadRankingRows(cid, {
    userId: asPositiveInt(adminUserId) || undefined,
    context: 'courseLeaderboard.admin.rank',
  });

  const entries = rows.map((row, index) =>
    toAdminLeaderboardEntry({
      rank: index + 1,
      studentId: row.student_id,
      fullName: row.full_name,
      averageScore: row.average_score,
      testsTaken: row.tests_taken,
      highestScore: row.highest_score,
      lowestScore: row.lowest_score,
    })
  );

  return {
    courseId: cid,
    courseTitle: String(course.title ?? ''),
    entries,
  };
}

/**
 * Admin drill-down: enrollment form fields + full submitted history in this course.
 *
 * @param {number} studentId
 * @param {number} courseId
 * @param {number} [adminUserId]
 */
export async function getAdminStudentCourseDetail(studentId, courseId, adminUserId = null) {
  const sid = asPositiveInt(studentId);
  const cid = asPositiveInt(courseId);
  if (!sid || !cid) {
    throw new ApiError(400, 'Invalid student or course id', { code: 'INVALID_ID' });
  }

  const actorId = asPositiveInt(adminUserId) || undefined;
  const course = await loadCourseRow(cid, {
    userId: actorId,
    context: 'courseLeaderboard.admin.detailCourse',
  });
  if (!course) {
    throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  }

  const db = scopedQuery({
    courseId: cid,
    context: 'courseLeaderboard.admin.detail',
    userId: actorId,
  });

  const enrollment = await db.first(
    `SELECT
       e.applicant_full_name,
       e.father_name,
       e.date_of_birth,
       e.gender,
       e.whatsapp_number,
       e.email,
       e.hssc_status,
       e.mdcat_attempt_type,
       p.name AS province_name,
       d.name AS district_name,
       c.name AS city_name,
       b.name AS board_name
     FROM enrollments e
     LEFT JOIN provinces p ON p.id = e.province_id
     LEFT JOIN districts d ON d.id = e.district_id
     LEFT JOIN cities c ON c.id = e.city_id
     LEFT JOIN intermediate_boards b ON b.id = e.board_id
     WHERE e.user_id = ?
       AND e.course_id = ?
     LIMIT 1`,
    [sid, cid]
  );

  const attemptRows = await db.rows(
    `SELECT
       a.id AS attempt_id,
       t.title AS test_title,
       a.submitted_at,
       r.score,
       r.max_score,
       r.percentage,
       ${DERIVED_PASS_STATUS_SQL} AS pass_status
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ? AND t.deleted_at IS NULL
     WHERE r.course_id = ?
       AND COALESCE(a.user_id, a.student_id) = ?
       AND a.status = 'submitted'
     ORDER BY a.submitted_at DESC, a.id DESC
     LIMIT ?`,
    [cid, cid, sid, MAX_DETAIL_ATTEMPTS]
  );

  if (!enrollment && attemptRows.length === 0) {
    throw new ApiError(404, 'Student not found in this course', { code: 'STUDENT_COURSE_NOT_FOUND' });
  }

  return {
    studentId: sid,
    courseId: cid,
    courseTitle: String(course.title ?? ''),
    enrollment: toAdminEnrollmentDetail(enrollment),
    attempts: attemptRows.map(toAdminAttemptDetail),
  };
}

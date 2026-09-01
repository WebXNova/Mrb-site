/**
 * Mark Course Finished — independent of is_active.
 * Closes admissions, revokes active enrollments via revokeEnrollment(), archives batches.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { ADMISSION_STATUS } from '../models/course.model.js';
import { revokeEnrollment } from './enrollmentLifecycle.service.js';
import { logActivity } from './activityLog.service.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { toCourseAdminDto } from '../dto/course.dto.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

export async function countActiveEnrollmentsForCourse(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) throw invalidCourseId();
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ? AND access_status = 'active'`,
    [cid]
  );
  return Number(rows[0]?.n ?? 0);
}

export async function getCourseFinishPreview(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) throw invalidCourseId();
  const row = await getCourseRowById(cid);
  if (!row) throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  const activeEnrollmentCount = await countActiveEnrollmentsForCourse(cid);
  const dto = toCourseAdminDto(row);
  return {
    course_id: cid,
    is_active: Boolean(Number(row.is_active)),
    admission_status: row.admission_status,
    is_finished: Boolean(row.finished_at),
    finished_at: row.finished_at ?? null,
    active_enrollment_count: activeEnrollmentCount,
    course: dto,
  };
}

/**
 * @param {number} courseId
 * @param {{ confirm: true, actor: { id?: number, role?: string } }} input
 */
export async function markCourseFinished(courseId, input) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) throw invalidCourseId();
  if (input?.confirm !== true) {
    throw new ApiError(400, 'This action requires confirm: true', {
      code: 'CONFIRMATION_REQUIRED',
    });
  }

  const actorId = Number(input.actor?.id) || null;
  const actorRole = input.actor?.role ?? 'admin';
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT id, is_active, admission_status, finished_at
       FROM courses WHERE id = ? LIMIT 1 FOR UPDATE`,
      [cid]
    );
    const course = courseRows[0];
    if (!course) {
      throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
    }

    const isActiveBefore = Boolean(Number(course.is_active));

    const [enrollmentRows] = await connection.query(
      `SELECT id FROM enrollments
       WHERE course_id = ? AND access_status = 'active'
       FOR UPDATE`,
      [cid]
    );

    const revoked = [];
    for (const row of enrollmentRows) {
      const result = await revokeEnrollment({
        enrollmentId: Number(row.id),
        connection,
        actor: 'admin.course.mark_finished',
        adminNote: 'Course marked finished',
      });
      revoked.push(result);
    }

    await connection.query(
      `UPDATE courses
       SET admission_status = ?,
           finished_at = COALESCE(finished_at, UTC_TIMESTAMP()),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [ADMISSION_STATUS.CLOSED, cid]
    );

    await connection.query(
      `UPDATE course_batches
       SET status = 'archived', is_active = FALSE
       WHERE course_id = ? AND status <> 'archived'`,
      [cid]
    );

    const [afterRows] = await connection.query(
      `SELECT is_active, admission_status, finished_at FROM courses WHERE id = ? LIMIT 1`,
      [cid]
    );
    const after = afterRows[0];
    const isActiveAfter = Boolean(Number(after?.is_active));
    if (isActiveAfter !== isActiveBefore) {
      throw new ApiError(500, 'Mark finished must not change is_active', {
        code: 'COURSE_FINISHED_INDEPENDENCE_VIOLATION',
      });
    }

    await connection.commit();

    await logActivity({
      userId: actorId,
      role: actorRole,
      action: 'admin.course.mark_finished',
      entityType: 'course',
      entityId: String(cid),
      metadata: {
        revoked_enrollment_count: revoked.length,
        revoked_enrollment_ids: revoked.map((r) => r.enrollmentId),
        admission_status: ADMISSION_STATUS.CLOSED,
        is_active_unchanged: isActiveAfter,
        already_finished: Boolean(course.finished_at),
      },
    });

    const updated = await getCourseRowById(cid);
    return {
      course: toCourseAdminDto(updated),
      revoked_enrollment_count: revoked.length,
      is_active: isActiveAfter,
      admission_status: ADMISSION_STATUS.CLOSED,
      is_finished: true,
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

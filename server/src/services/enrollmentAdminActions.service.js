/**
 * Composite admin actions on enrollments that require multi-table transactional writes.
 *
 * Currently exposes: suspendStudentForEnrollment — atomically revokes/rejects an enrollment,
 * suspends the linked user, and revokes that user's auth sessions. All steps share a single
 * MySQL transaction so partial failures cannot leave the system half-suspended.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import { revokeEnrollment } from './enrollmentLifecycle.service.js';

function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
  return n;
}

/**
 * Suspend a student via the registrations panel.
 *
 * Single transaction:
 * 1. Lock enrollment row, resolve user, load current user state.
 * 2. Block self-suspend and non-student targets.
 * 3. If the enrollment grants active access → revoke through lifecycle service (sets
 *    access_status='revoked', status='rejected', emits SIEM audit). Otherwise mark
 *    the enrollment as rejected/inactive with the admin note and reviewer.
 * 4. Set users.status = 'suspended' and bump token_version + revoke auth_sessions so
 *    existing access tokens fail on next refresh.
 *
 * @param {object} input
 * @param {number} input.enrollmentId
 * @param {string} input.adminNote   - required, 3..500 chars
 * @param {{ id: number, role?: string }} input.actor
 * @returns {Promise<{ enrollment: object, user: object }>}
 */
export async function suspendStudentForEnrollment(input) {
  const enrollmentId = normalizePositiveInt(input.enrollmentId, 'enrollment_id');
  const actorId = Number(input.actor?.id);
  const adminNote = String(input.adminNote || '').trim();
  if (adminNote.length < 3 || adminNote.length > 500) {
    throw new ApiError(422, 'adminNote is required (3 to 500 characters) when suspending a student');
  }
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const connection = await mysqlPool.getConnection();
  let committed = false;
  try {
    await connection.beginTransaction();

    const [enrollmentRows] = await connection.query(
      `SELECT id, user_id, course_id, status, access_status
       FROM enrollments
       WHERE id = ?
       FOR UPDATE`,
      [enrollmentId]
    );
    const enrollment = enrollmentRows[0];
    if (!enrollment) {
      throw new ApiError(404, 'Enrollment not found');
    }

    const userId = Number(enrollment.user_id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ApiError(409, 'Enrollment is not linked to a valid user');
    }
    if (userId === actorId) {
      throw new ApiError(403, 'Admins cannot suspend their own account');
    }

    const [userRows] = await connection.query(
      `SELECT id, email, username, full_name, role, status
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [userId]
    );
    const user = userRows[0];
    if (!user) {
      throw new ApiError(404, 'Linked user not found');
    }
    const targetRole = String(user.role || '').toLowerCase();
    if (targetRole !== 'student') {
      throw new ApiError(403, 'Only student accounts can be suspended');
    }

    // 1) Apply enrollment-level revocation/rejection inside the same transaction.
    const accessStatus = String(enrollment.access_status || '').toLowerCase();
    let enrollmentAction = 'rejected';
    if (accessStatus === 'active') {
      await revokeEnrollment({
        enrollmentId,
        connection,
        actor: 'admin.suspend',
        adminNote,
      });
      enrollmentAction = 'revoked';
      // revokeEnrollment() updates access_status/status only — persist reviewer + note here.
      await connection.query(
        `UPDATE enrollments
         SET admin_note = ?,
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminNote, actorId, enrollmentId]
      );
    } else {
      await connection.query(
        `UPDATE enrollments
         SET status = 'rejected',
             access_status = 'inactive',
             admin_note = ?,
             reviewed_by = ?,
             reviewed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [adminNote, actorId, enrollmentId]
      );
    }

    // 2) Suspend the user account in the same transaction.
    await connection.query(
      `UPDATE users
       SET status = 'suspended',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId]
    );

    // 3) Revoke all auth sessions and bump token_version. Done inside the transaction so
    //    partial failures roll back together with the user/enrollment writes.
    await connection.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE user_id = ?`,
      [userId]
    );
    await connection.query(
      `UPDATE users SET token_version = token_version + 1 WHERE id = ?`,
      [userId]
    );

    await connection.commit();
    committed = true;

    await logActivity({
      userId: actorId,
      role: input.actor?.role,
      action: 'admin.enrollment.student.suspend',
      entityType: 'enrollment',
      entityId: String(enrollmentId),
      metadata: {
        userId,
        enrollmentAction,
        previousAccessStatus: accessStatus || null,
      },
    });
    await logActivity({
      userId: actorId,
      role: input.actor?.role,
      action: 'admin.user.status.update',
      entityType: 'user',
      entityId: String(userId),
      metadata: {
        status: 'suspended',
        targetRole,
        sessionsRevoked: true,
        viaEnrollmentId: enrollmentId,
      },
    });

    return {
      enrollmentId,
      userId,
      enrollmentAction,
    };
  } catch (error) {
    if (!committed) {
      try {
        await connection.rollback();
      } catch {
        /* ignore rollback errors */
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

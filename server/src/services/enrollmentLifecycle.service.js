/**
 * CEE Enrollment Lifecycle — single source of truth for access_status mutations.
 *
 * Business rule: at most one enrollment per user with access_status = 'active'.
 * No database triggers — transactional application enforcement with row locks.
 *
 * Concurrency strategy:
 * - BEGIN transaction
 * - SELECT target enrollment FOR UPDATE (serializes competing activations on same row)
 * - SELECT all active enrollments for user FOR UPDATE (serializes cross-enrollment races)
 * - Deactivate all other active rows, activate target, verify count === 1
 * - COMMIT or ROLLBACK on any failure
 *
 * Idempotency: if target is already the sole active approved enrollment, return success without error.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { auditEnrollmentLifecycleEvent } from './enrollmentLifecycleAudit.js';
import {
  EnrollmentActivationDeniedError,
  EnrollmentIntegrityViolationError,
  EnrollmentLifecycleNotFoundError,
  EnrollmentPaymentRequiredError,
  EnrollmentRevokedStateError,
  EnrollmentRaceIntegrityError,
} from '../errors/enrollment/EnrollmentLifecycleErrors.js';

/**
 * @typedef {object} EnrollmentRow
 * @property {number} id
 * @property {number} user_id
 * @property {number} course_id
 * @property {string} status
 * @property {string} access_status
 * @property {number|null} order_id
 */

/**
 * @typedef {object} ActivateEnrollmentOptions
 * @property {number} enrollmentId
 * @property {number|null} [orderId] — link paid order on activation
 * @property {import('mysql2/promise').PoolConnection} [connection] — participate in caller transaction
 * @property {string} [actor] — audit label (payment.webhook, admin.approval, …)
 * @property {string} [reason]
 * @property {boolean} [requirePaidOrder=true]
 * @property {boolean} [setStatusApproved=true]
 */

/**
 * @typedef {object} ActivationResult
 * @property {boolean} ok
 * @property {number} enrollmentId
 * @property {number} userId
 * @property {number} courseId
 * @property {boolean} [idempotent]
 * @property {number} deactivatedCount
 */

/**
 * @param {number} value
 * @param {string} label
 */
function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
  return n;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} enrollmentId
 * @returns {Promise<EnrollmentRow|null>}
 */
async function lockEnrollmentById(connection, enrollmentId) {
  const [rows] = await connection.query(
    `SELECT e.id, e.user_id, e.course_id, e.status, e.access_status, e.order_id
     FROM enrollments e
     WHERE e.id = ?
     FOR UPDATE`,
    [enrollmentId]
  );
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} userId
 * @returns {Promise<ReadonlyArray<{ id: number }>>}
 */
async function lockActiveEnrollmentsForUser(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id FROM enrollments WHERE user_id = ? AND access_status = 'active' FOR UPDATE`,
    [userId]
  );
  return rows;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} userId
 * @param {number} expectedEnrollmentId
 */
async function assertExactlyOneActiveEnrollment(connection, userId, expectedEnrollmentId) {
  const [rows] = await connection.query(
    `SELECT id FROM enrollments WHERE user_id = ? AND access_status = 'active'`,
    [userId]
  );

  if (rows.length !== 1) {
    auditEnrollmentLifecycleEvent({
      action: 'integrity_violation',
      result: 'failure',
      userId,
      enrollmentId: expectedEnrollmentId,
      courseId: null,
      actor: 'integrity.assert',
      reason: `active_count=${rows.length}`,
      errorCode: 'ENROLLMENT_INTEGRITY_VIOLATION',
    });
    throw new EnrollmentIntegrityViolationError({
      userId,
      expectedEnrollmentId,
      activeCount: rows.length,
      activeIds: rows.map((r) => Number(r.id)),
    });
  }

  if (Number(rows[0].id) !== Number(expectedEnrollmentId)) {
    auditEnrollmentLifecycleEvent({
      action: 'integrity_violation',
      result: 'failure',
      userId,
      enrollmentId: expectedEnrollmentId,
      courseId: null,
      actor: 'integrity.assert',
      reason: `wrong_active_id=${rows[0].id}`,
      errorCode: 'ENROLLMENT_INTEGRITY_VIOLATION',
    });
    throw new EnrollmentRaceIntegrityError({
      userId,
      expectedEnrollmentId,
      actualActiveId: rows[0].id,
    });
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {EnrollmentRow} enrollment
 * @param {ActivateEnrollmentOptions} options
 */
async function validateActivationEligibility(connection, enrollment, options) {
  const enrollmentId = enrollment.id;
  const userId = enrollment.user_id;
  const courseId = enrollment.course_id;

  const [userRows] = await connection.query(`SELECT id FROM users WHERE id = ? LIMIT 1`, [userId]);
  if (!userRows[0]) {
    throw new EnrollmentActivationDeniedError({ enrollmentId, reason: 'user_not_found' });
  }

  const [courseRows] = await connection.query(
    `SELECT id, is_active FROM courses WHERE id = ? LIMIT 1`,
    [courseId]
  );
  if (!courseRows[0]) {
    throw new EnrollmentActivationDeniedError({ enrollmentId, reason: 'course_not_found' });
  }
  if (!courseRows[0].is_active) {
    throw new EnrollmentActivationDeniedError({ enrollmentId, reason: 'course_inactive' });
  }

  if (String(enrollment.access_status).toLowerCase() === 'revoked') {
    throw new EnrollmentRevokedStateError({ enrollmentId, userId });
  }

  if (String(enrollment.status).toLowerCase() === 'rejected') {
    throw new EnrollmentActivationDeniedError({ enrollmentId, reason: 'enrollment_rejected' });
  }

  const orderIdToCheck = options.orderId ?? enrollment.order_id;
  if (options.requirePaidOrder !== false && orderIdToCheck) {
    const [orderRows] = await connection.query(
      `SELECT id, status, user_id, course_id FROM orders WHERE id = ? LIMIT 1`,
      [orderIdToCheck]
    );
    const order = orderRows[0];
    if (!order) {
      throw new EnrollmentPaymentRequiredError({ enrollmentId, orderId: orderIdToCheck, reason: 'order_missing' });
    }
    if (String(order.status) !== 'paid') {
      throw new EnrollmentPaymentRequiredError({
        enrollmentId,
        orderId: orderIdToCheck,
        orderStatus: order.status,
      });
    }
    if (Number(order.user_id) !== Number(userId)) {
      throw new EnrollmentActivationDeniedError({ enrollmentId, reason: 'order_user_mismatch' });
    }
    if (Number(order.course_id) !== Number(courseId)) {
      throw new EnrollmentActivationDeniedError({ enrollmentId, reason: 'order_course_mismatch' });
    }
  }
}

/**
 * Core activation inside an open transaction.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {ActivateEnrollmentOptions} options
 * @returns {Promise<ActivationResult>}
 */
export async function activateEnrollmentInTransaction(connection, options) {
  const enrollmentId = normalizePositiveInt(options.enrollmentId, 'enrollment_id');
  const actor = options.actor ?? 'system';
  const orderId = options.orderId ?? null;

  const enrollment = await lockEnrollmentById(connection, enrollmentId);
  if (!enrollment) {
    throw new EnrollmentLifecycleNotFoundError({ enrollmentId });
  }

  const userId = Number(enrollment.user_id);
  const courseId = Number(enrollment.course_id);

  await validateActivationEligibility(connection, enrollment, options);

  const activeRows = await lockActiveEnrollmentsForUser(connection, userId);
  const alreadySoleActive =
    activeRows.length === 1 &&
    Number(activeRows[0].id) === enrollmentId &&
    String(enrollment.access_status) === 'active' &&
    (!options.setStatusApproved || String(enrollment.status) === 'approved');

  if (alreadySoleActive) {
    auditEnrollmentLifecycleEvent({
      action: 'idempotent_skip',
      result: 'idempotent',
      userId,
      enrollmentId,
      courseId,
      actor,
      reason: options.reason ?? 'already_active',
    });
    return {
      ok: true,
      enrollmentId,
      userId,
      courseId,
      idempotent: true,
      deactivatedCount: 0,
    };
  }

  const [deactRes] = await connection.query(
    `UPDATE enrollments
     SET access_status = 'inactive', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND access_status = 'active' AND id <> ?`,
    [userId, enrollmentId]
  );
  const deactivatedCount = Number(deactRes?.affectedRows ?? 0);

  const setParts = [`access_status = 'active'`, `updated_at = CURRENT_TIMESTAMP`];
  const updateParams = [];
  if (options.setStatusApproved !== false) {
    setParts.unshift(`status = 'approved'`);
  }
  if (orderId != null) {
    setParts.unshift('order_id = ?');
    updateParams.push(orderId);
  }
  updateParams.push(enrollmentId, userId);

  const [actRes] = await connection.query(
    `UPDATE enrollments SET ${setParts.join(', ')} WHERE id = ? AND user_id = ?`,
    updateParams
  );

  if (Number(actRes?.affectedRows ?? 0) === 0) {
    throw new EnrollmentActivationDeniedError({
      enrollmentId,
      userId,
      reason: 'activate_update_affected_zero',
    });
  }

  await assertExactlyOneActiveEnrollment(connection, userId, enrollmentId);

  auditEnrollmentLifecycleEvent({
    action: 'activation',
    result: 'success',
    userId,
    enrollmentId,
    courseId,
    actor,
    reason: options.reason ?? 'activated',
  });

  return {
    ok: true,
    enrollmentId,
    userId,
    courseId,
    idempotent: false,
    deactivatedCount,
  };
}

/**
 * Activate enrollment — owns transaction unless connection provided.
 * @param {ActivateEnrollmentOptions} options
 * @returns {Promise<ActivationResult>}
 */
export async function activateEnrollment(options) {
  const external = options.connection ?? null;
  if (external) {
    return activateEnrollmentInTransaction(external, options);
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await activateEnrollmentInTransaction(connection, options);
    await connection.commit();
    return result;
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

/**
 * @param {object} options
 * @param {number} options.userId
 * @param {number} [options.exceptEnrollmentId]
 * @param {import('mysql2/promise').PoolConnection} [options.connection]
 * @param {string} [options.actor]
 */
export async function deactivateEnrollment(options) {
  const userId = normalizePositiveInt(options.userId, 'user_id');
  const exceptId = options.exceptEnrollmentId ?? null;
  const actor = options.actor ?? 'deactivate';
  const external = options.connection ?? null;

  const run = async (connection) => {
    await connection.query(
      `SELECT id FROM enrollments WHERE user_id = ? AND access_status = 'active' FOR UPDATE`,
      [userId]
    );

    const params = [userId];
    let sql = `UPDATE enrollments
               SET access_status = 'inactive', updated_at = CURRENT_TIMESTAMP
               WHERE user_id = ? AND access_status = 'active'`;
    if (exceptId != null) {
      sql += ' AND id <> ?';
      params.push(normalizePositiveInt(exceptId, 'except_enrollment_id'));
    }
    const [res] = await connection.query(sql, params);
    const count = Number(res?.affectedRows ?? 0);

    auditEnrollmentLifecycleEvent({
      action: 'deactivation',
      result: 'success',
      userId,
      enrollmentId: exceptId,
      courseId: null,
      actor,
      reason: `deactivated_count=${count}`,
    });

    return { ok: true, deactivatedCount: count };
  };

  if (external) {
    return run(external);
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
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

/**
 * @param {object} options
 * @param {number} options.enrollmentId
 * @param {import('mysql2/promise').PoolConnection} [options.connection]
 * @param {string} [options.actor]
 * @param {string} [options.adminNote]
 */
export async function revokeEnrollment(options) {
  const enrollmentId = normalizePositiveInt(options.enrollmentId, 'enrollment_id');
  const actor = options.actor ?? 'revoke';
  const external = options.connection ?? null;

  const run = async (connection) => {
    const row = await lockEnrollmentById(connection, enrollmentId);
    if (!row) {
      throw new EnrollmentLifecycleNotFoundError({ enrollmentId });
    }

    await connection.query(
      `UPDATE enrollments
       SET access_status = 'revoked',
           status = 'rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [enrollmentId]
    );

    auditEnrollmentLifecycleEvent({
      action: 'revocation',
      result: 'success',
      userId: row.user_id,
      enrollmentId,
      courseId: row.course_id,
      actor,
      reason: options.adminNote ?? 'revoked',
    });

    return { ok: true, enrollmentId, userId: row.user_id, courseId: row.course_id };
  };

  if (external) {
    return run(external);
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
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

/**
 * Best-effort removal of legacy DB triggers (no CREATE — avoids SUPER).
 * @param {import('mysql2/promise').Pool} [pool]
 */
export async function dropLegacyEnrollmentTriggers(pool = mysqlPool) {
  const names = [
    'cee_enrollments_one_active_per_user',
    'cee_enrollments_one_active_per_user_upd',
  ];
  for (const name of names) {
    try {
      await pool.query(`DROP TRIGGER IF EXISTS ${name}`);
    } catch (error) {
      console.warn(`[CEE.schema] Could not drop legacy trigger ${name}:`, error.message);
    }
  }
}

/**
 * Canonical paid-standalone payment grant.
 * Approval confirms a seat. It does NOT open the exam.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import {
  STANDALONE_ORDER_STATUS,
  STANDALONE_PAYMENT_STATUS,
  STANDALONE_SEAT_STATUS,
} from '../constants/paidStandalone.constants.js';
import { isPaidStandaloneTest } from '../security/cee/paidStandaloneAccess.service.js';

/**
 * Count confirmed seats with the test row locked.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 */
export async function countConfirmedStandaloneSeats(connection, testId) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS n
     FROM standalone_test_orders
     WHERE test_id = ?
       AND status = ?
       AND seat_status = ?`,
    [testId, STANDALONE_ORDER_STATUS.APPROVED, STANDALONE_SEAT_STATUS.CONFIRMED]
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * @param {{ submissionId: number, actorId: number, actorRole: string }}
 */
export async function approvePaidStandalonePayment({ submissionId, actorId, actorRole }) {
  const sid = Number(submissionId);
  const uid = Number(actorId);
  if (!Number.isInteger(sid) || sid <= 0) {
    throw new ApiError(400, 'Invalid submission id');
  }
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [payRows] = await connection.query(
      `SELECT p.*, o.test_id, o.user_id AS order_user_id, o.amount AS order_amount, o.status AS order_status,
              o.seat_status, t.test_access_type, t.course_id, t.price_pkr, t.seat_capacity, t.title AS test_title
       FROM standalone_test_payments p
       INNER JOIN standalone_test_orders o ON o.id = p.order_id
       INNER JOIN tests t ON t.id = o.test_id
       WHERE p.id = ?
       FOR UPDATE`,
      [sid]
    );
    const payment = payRows[0];
    if (!payment) {
      throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
    }

    const [orderLock] = await connection.query(
      `SELECT * FROM standalone_test_orders WHERE id = ? FOR UPDATE`,
      [payment.order_id]
    );
    const order = orderLock[0];
    const [testLock] = await connection.query(
      `SELECT id, test_access_type, course_id, price_pkr, seat_capacity, status, access_mode
       FROM tests WHERE id = ? FOR UPDATE`,
      [payment.test_id]
    );
    const test = testLock[0];

    if (!test || !isPaidStandaloneTest(test) || test.course_id != null) {
      throw new ApiError(409, 'This payment is not for a paid standalone test', {
        code: 'INVALID_STANDALONE_TEST',
      });
    }

    if (String(payment.status) === STANDALONE_PAYMENT_STATUS.APPROVED) {
      throw new ApiError(409, 'This payment is already approved', { code: 'ALREADY_APPROVED' });
    }
    if (String(payment.status) !== STANDALONE_PAYMENT_STATUS.PENDING_REVIEW) {
      throw new ApiError(409, 'Only pending submissions can be approved', {
        code: 'INVALID_PAYMENT_STATE',
      });
    }
    if (String(order.status) === STANDALONE_ORDER_STATUS.APPROVED) {
      throw new ApiError(409, 'This order is already approved', { code: 'ALREADY_APPROVED' });
    }
    if (
      String(order.status) !== STANDALONE_ORDER_STATUS.UNDER_REVIEW &&
      String(order.status) !== STANDALONE_ORDER_STATUS.PENDING
    ) {
      throw new ApiError(409, 'This order cannot be approved', { code: 'INVALID_ORDER_STATE' });
    }
    if (Number(order.user_id) !== Number(payment.student_id)) {
      throw new ApiError(409, 'Payment student does not match the order', { code: 'ORDER_OWNERSHIP' });
    }

    const expectedAmount = Number(test.price_pkr);
    if (Number(order.amount) !== expectedAmount) {
      throw new ApiError(409, 'Order amount does not match the test price', {
        code: 'AMOUNT_MISMATCH',
      });
    }

    const capacity = Number(test.seat_capacity);
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new ApiError(409, 'This test has no seat capacity configured', { code: 'NO_CAPACITY' });
    }

    const confirmed = await countConfirmedStandaloneSeats(connection, Number(test.id));
    if (confirmed >= capacity) {
      throw new ApiError(409, 'All seats for this test are already confirmed', {
        code: 'CAPACITY_REACHED',
      });
    }

    await connection.query(
      `UPDATE standalone_test_payments
       SET status = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = ?`,
      [STANDALONE_PAYMENT_STATUS.APPROVED, uid, sid, STANDALONE_PAYMENT_STATUS.PENDING_REVIEW]
    );

    const [orderUpdate] = await connection.query(
      `UPDATE standalone_test_orders
       SET status = ?, seat_status = ?, approved_at = UTC_TIMESTAMP(), updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN (?, ?)`,
      [
        STANDALONE_ORDER_STATUS.APPROVED,
        STANDALONE_SEAT_STATUS.CONFIRMED,
        order.id,
        STANDALONE_ORDER_STATUS.UNDER_REVIEW,
        STANDALONE_ORDER_STATUS.PENDING,
      ]
    );
    if (Number(orderUpdate.affectedRows) !== 1) {
      throw new ApiError(409, 'Could not confirm the seat', { code: 'SEAT_CONFIRM_FAILED' });
    }

    const after = await countConfirmedStandaloneSeats(connection, Number(test.id));
    if (after > capacity) {
      throw new ApiError(409, 'All seats for this test are already confirmed', {
        code: 'CAPACITY_REACHED',
      });
    }

    await connection.commit();

    await logActivity({
      userId: uid,
      action: 'standalone_test_payment_approved',
      entityType: 'standalone_test_payment',
      entityId: sid,
      metadata: {
        orderId: Number(order.id),
        testId: Number(test.id),
        studentId: Number(payment.student_id),
        actorRole,
        examOpened: false,
      },
    });

    return {
      submissionId: sid,
      orderId: Number(order.id),
      testId: Number(test.id),
      studentId: Number(payment.student_id),
      paymentStatus: STANDALONE_PAYMENT_STATUS.APPROVED,
      orderStatus: STANDALONE_ORDER_STATUS.APPROVED,
      seatStatus: STANDALONE_SEAT_STATUS.CONFIRMED,
      confirmedSeats: after,
      seatCapacity: capacity,
      examOpen: false,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ submissionId: number, actorId: number, adminNote?: string|null }}
 */
export async function rejectPaidStandalonePayment({ submissionId, actorId, adminNote }) {
  const sid = Number(submissionId);
  const uid = Number(actorId);
  if (!Number.isInteger(sid) || sid <= 0) {
    throw new ApiError(400, 'Invalid submission id');
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [payRows] = await connection.query(
      `SELECT p.*, o.id AS order_id, o.status AS order_status, o.seat_status
       FROM standalone_test_payments p
       INNER JOIN standalone_test_orders o ON o.id = p.order_id
       WHERE p.id = ?
       FOR UPDATE`,
      [sid]
    );
    const payment = payRows[0];
    if (!payment) {
      throw new ApiError(404, 'Payment submission not found', { code: 'SUBMISSION_NOT_FOUND' });
    }
    if (String(payment.status) === STANDALONE_PAYMENT_STATUS.APPROVED) {
      throw new ApiError(409, 'Approved payments cannot be rejected from this action', {
        code: 'ALREADY_APPROVED',
      });
    }
    if (String(payment.status) !== STANDALONE_PAYMENT_STATUS.PENDING_REVIEW) {
      throw new ApiError(409, 'Only pending submissions can be rejected', {
        code: 'INVALID_PAYMENT_STATE',
      });
    }

    await connection.query(
      `UPDATE standalone_test_payments
       SET status = ?, admin_note = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP()
       WHERE id = ? AND status = ?`,
      [
        STANDALONE_PAYMENT_STATUS.REJECTED,
        adminNote ? String(adminNote).slice(0, 2000) : null,
        uid,
        sid,
        STANDALONE_PAYMENT_STATUS.PENDING_REVIEW,
      ]
    );

    await connection.query(
      `UPDATE standalone_test_orders
       SET status = ?, seat_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN (?, ?)`,
      [
        STANDALONE_ORDER_STATUS.REJECTED,
        STANDALONE_SEAT_STATUS.RELEASED,
        payment.order_id,
        STANDALONE_ORDER_STATUS.UNDER_REVIEW,
        STANDALONE_ORDER_STATUS.PENDING,
      ]
    );

    await connection.commit();
    return {
      submissionId: sid,
      orderId: Number(payment.order_id),
      paymentStatus: STANDALONE_PAYMENT_STATUS.REJECTED,
      orderStatus: STANDALONE_ORDER_STATUS.REJECTED,
      seatStatus: STANDALONE_SEAT_STATUS.RELEASED,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

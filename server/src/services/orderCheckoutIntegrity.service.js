/**
 * Checkout session integrity — enrollment locking, pending-order superseding, fulfillment guards.
 */

import { ApiError } from '../utils/apiError.js';
import { assertOrderTransitionAllowed } from './orderStateMachine.service.js';
import {
  logPaymentSecurityEvent,
  PAYMENT_SECURITY_EVENTS,
} from './paymentSecurityEvents.js';

export const ORDER_CANCELLATION_REASON_SUPERSEDED = 'superseded';

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} enrollmentId
 * @param {number} userId
 */
export async function lockEnrollmentForCheckout(connection, enrollmentId, userId) {
  const [rows] = await connection.query(
    `SELECT id, user_id, course_id, order_id, status, access_status
     FROM enrollments
     WHERE id = ? AND user_id = ?
     FOR UPDATE`,
    [enrollmentId, userId]
  );
  const row = rows[0];
  if (!row) {
    throw new ApiError(404, 'Enrollment not found');
  }
  return row;
}

/**
 * Cancel all pending orders for an enrollment before issuing a new checkout session.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} enrollmentId
 * @returns {Promise<number>} rows cancelled
 */
export async function cancelSupersededPendingOrdersForEnrollment(connection, enrollmentId) {
  const [result] = await connection.query(
    `UPDATE orders
     SET status = 'cancelled',
         cancellation_reason = ?,
         cancelled_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE enrollment_id = ? AND status = 'pending'`,
    [ORDER_CANCELLATION_REASON_SUPERSEDED, enrollmentId]
  );
  return Number(result?.affectedRows ?? 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   userId: number,
 *   courseId: number,
 *   enrollmentId: number,
 *   amount: number,
 *   currency?: string,
 * }} params
 * @returns {Promise<number>} new order id
 */
export async function insertPendingCheckoutOrder(connection, params) {
  const currency = String(params.currency || 'PKR').toUpperCase();
  try {
    const [orderResult] = await connection.query(
      `INSERT INTO orders (user_id, course_id, enrollment_id, amount, currency, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [params.userId, params.courseId, params.enrollmentId, params.amount, currency]
    );
    return Number(orderResult.insertId);
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.DUPLICATE_PENDING_ORDER_PREVENTED, {
        enrollmentId: params.enrollmentId,
        errno: error.code,
      });
      throw new ApiError(
        409,
        'Another checkout is already in progress for this enrollment. Please retry.',
        { code: 'DUPLICATE_PENDING_ORDER' }
      );
    }
    throw error;
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} enrollmentId
 * @param {number} orderId
 */
export async function bindEnrollmentToCheckoutOrder(connection, enrollmentId, orderId) {
  const [result] = await connection.query(
    `UPDATE enrollments
     SET order_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [orderId, enrollmentId]
  );
  if (Number(result?.affectedRows ?? 0) === 0) {
    throw new ApiError(404, 'Enrollment not found');
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} enrollmentId
 */
export async function lockEnrollmentByIdForFulfillment(connection, enrollmentId) {
  const [rows] = await connection.query(
    `SELECT id, user_id, course_id, order_id, status, access_status
     FROM enrollments
     WHERE id = ?
     FOR UPDATE`,
    [enrollmentId]
  );
  return rows[0] ?? null;
}

/**
 * Mark order paid — only from pending (strict state machine).
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {object} params
 */
export async function markOrderPaidFromPending(connection, params) {
  assertOrderTransitionAllowed('pending', 'paid', 'markOrderPaidFromPending');

  const [updateResult] = await connection.query(
    `UPDATE orders
     SET status = 'paid',
         gateway_order_ref = ?,
         safepay_transaction_id = ?,
         safepay_tracker = COALESCE(safepay_tracker, NULLIF(?, '')),
         gateway_payload_json = CAST(? AS JSON),
         paid_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    [
      params.gatewayRefForDb,
      params.safepayTxnForDb ?? null,
      params.rawTrackerSlice ?? '',
      params.payloadJsonStr,
      params.orderId,
    ]
  );

  return Number(updateResult?.affectedRows ?? 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} orderId
 */
export async function markOrderFailedFromPending(connection, orderId) {
  assertOrderTransitionAllowed('pending', 'failed', 'markOrderFailedFromPending');
  const [result] = await connection.query(
    `UPDATE orders
     SET status = 'failed', updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    [orderId]
  );
  return Number(result?.affectedRows ?? 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} orderId
 * @param {string} token
 * @param {string|null|undefined} tracker
 */
export async function attachSafepaySessionToOrder(connection, orderId, token, tracker) {
  await connection.query(
    `UPDATE orders
     SET safepay_token = ?, safepay_tracker = COALESCE(?, safepay_tracker), updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'pending'`,
    [token, tracker ?? null, orderId]
  );
}

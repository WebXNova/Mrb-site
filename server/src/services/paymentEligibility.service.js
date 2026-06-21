/**
 * H-02 — Payment session eligibility (checkout creation gate).
 *
 * Single source of truth for whether an enrollment may start a new Safepay checkout session.
 * Webhook fulfillment uses paymentFulfillmentGate.service.js — do not merge the two.
 */

import { ApiError } from '../utils/apiError.js';
import { StructuredLogger } from '../utils/requestId.js';
import {
  logPaymentSecurityEvent,
  PAYMENT_SECURITY_EVENTS,
} from './paymentSecurityEvents.js';

const auditLogger = new StructuredLogger({ service: 'paymentEligibility' });

export const PAYMENT_SESSION_INELIGIBLE_CODES = Object.freeze({
  ENROLLMENT_ACTIVE: 'ENROLLMENT_ACTIVE',
  ENROLLMENT_APPROVED: 'ENROLLMENT_APPROVED',
  ENROLLMENT_REJECTED: 'ENROLLMENT_REJECTED',
  PAID_ORDER_EXISTS: 'PAID_ORDER_EXISTS',
  ENROLLMENT_LOCKED: 'ENROLLMENT_LOCKED',
  ENROLLMENT_INVALID_STATE: 'ENROLLMENT_INVALID_STATE',
});

const INELIGIBLE_MESSAGES = Object.freeze({
  [PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_ACTIVE]:
    'This enrollment is already active. Payment is not required.',
  [PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_APPROVED]:
    'This enrollment has already been approved. A new payment session cannot be created.',
  [PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_REJECTED]:
    'This enrollment was rejected. Payment is not available.',
  [PAYMENT_SESSION_INELIGIBLE_CODES.PAID_ORDER_EXISTS]:
    'A paid order already exists for this enrollment.',
  [PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_LOCKED]:
    'This enrollment is locked and cannot accept payment.',
  [PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE]:
    'This enrollment is not in a valid state for payment.',
});

const VALID_ENROLLMENT_STATUSES = new Set(['pending', 'approved', 'rejected']);
const VALID_ACCESS_STATUSES = new Set(['active', 'inactive', 'revoked']);

/**
 * @typedef {object} PaymentSessionEligibilityInput
 * @property {{ id?: number, status?: string, access_status?: string, order_id?: number|null }|null} enrollment
 * @property {{ id?: number, status?: string }|null} [paidOrder]
 * @property {{ id?: number, status?: string }|null} [linkedOrder]
 * @property {string} [userAccountStatus]
 */

/**
 * Pure eligibility evaluation — unit-testable without MySQL.
 *
 * @param {PaymentSessionEligibilityInput} input
 * @returns {{ eligible: true } | { eligible: false, code: string, reason: string, message: string }}
 */
export function evaluatePaymentSessionEligibility({
  enrollment,
  paidOrder = null,
  linkedOrder = null,
  userAccountStatus = 'active',
}) {
  if (!enrollment || enrollment.id == null) {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE,
      'enrollment_missing'
    );
  }

  const enrollmentStatus = String(enrollment.status || '').trim().toLowerCase();
  const accessStatus = String(enrollment.access_status || '').trim().toLowerCase();
  const accountStatus = String(userAccountStatus || '').trim().toLowerCase();

  if (!VALID_ENROLLMENT_STATUSES.has(enrollmentStatus)) {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE,
      `unknown_enrollment_status:${enrollmentStatus || 'empty'}`
    );
  }

  if (!VALID_ACCESS_STATUSES.has(accessStatus)) {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE,
      `unknown_access_status:${accessStatus || 'empty'}`
    );
  }

  if (enrollmentStatus === 'rejected') {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_REJECTED,
      'enrollment_status_rejected'
    );
  }

  if (enrollmentStatus === 'approved') {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_APPROVED,
      'enrollment_status_approved'
    );
  }

  if (accessStatus === 'active') {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_ACTIVE,
      'enrollment_access_active'
    );
  }

  if (accessStatus === 'revoked' || accountStatus === 'suspended') {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_LOCKED,
      accessStatus === 'revoked' ? 'enrollment_access_revoked' : 'user_account_suspended'
    );
  }

  const hasPaidOrder =
    (paidOrder && String(paidOrder.status || '').toLowerCase() === 'paid') ||
    (linkedOrder && String(linkedOrder.status || '').toLowerCase() === 'paid');

  if (hasPaidOrder) {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.PAID_ORDER_EXISTS,
      'paid_order_exists'
    );
  }

  if (enrollmentStatus !== 'pending') {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE,
      `enrollment_status_not_pending:${enrollmentStatus}`
    );
  }

  if (accessStatus !== 'inactive') {
    return ineligible(
      PAYMENT_SESSION_INELIGIBLE_CODES.ENROLLMENT_INVALID_STATE,
      `enrollment_access_not_inactive:${accessStatus}`
    );
  }

  return { eligible: true };
}

/**
 * @param {string} code
 * @param {string} reason
 */
function ineligible(code, reason) {
  return {
    eligible: false,
    code,
    reason,
    message: INELIGIBLE_MESSAGES[code] || INELIGIBLE_MESSAGES.ENROLLMENT_INVALID_STATE,
  };
}

/**
 * @param {{
 *   enrollmentId: number,
 *   userId: number,
 *   code: string,
 *   reason: string,
 * }} detail
 */
export function logPaymentSessionEligibilityRejection(detail) {
  const payload = {
    enrollmentId: detail.enrollmentId,
    userId: detail.userId,
    code: detail.code,
    reason: detail.reason,
    timestamp: new Date().toISOString(),
  };

  auditLogger.warn('Payment session eligibility rejected', payload);
  logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.PAYMENT_SESSION_INELIGIBLE, payload);
}

/**
 * Load order + user context for eligibility inside an open transaction.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ id: number, user_id: number, order_id?: number|null }} enrollmentRow
 */
export async function loadPaymentSessionEligibilityContext(connection, enrollmentRow) {
  const enrollmentId = Number(enrollmentRow.id);
  const userId = Number(enrollmentRow.user_id);
  const orderId = enrollmentRow.order_id == null ? null : Number(enrollmentRow.order_id);

  const [paidOrderResult, userResult, linkedOrderResult] = await Promise.all([
    connection.query(
      `SELECT id, status
       FROM orders
       WHERE enrollment_id = ? AND status = 'paid'
       ORDER BY id DESC
       LIMIT 1`,
      [enrollmentId]
    ),
    connection.query(`SELECT status FROM users WHERE id = ? LIMIT 1`, [userId]),
    orderId
      ? connection.query(`SELECT id, status FROM orders WHERE id = ? LIMIT 1`, [orderId])
      : Promise.resolve([[]]),
  ]);

  return {
    paidOrder: paidOrderResult[0]?.[0] ?? null,
    linkedOrder: linkedOrderResult[0]?.[0] ?? null,
    userAccountStatus: userResult[0]?.[0]?.status ?? 'active',
  };
}

/**
 * Assert enrollment may start checkout — throws ApiError 409 when ineligible.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ id: number, user_id: number, status: string, access_status: string, order_id?: number|null }} enrollmentRow
 */
export async function assertPaymentSessionEligible(connection, enrollmentRow) {
  const context = await loadPaymentSessionEligibilityContext(connection, enrollmentRow);
  const result = evaluatePaymentSessionEligibility({
    enrollment: enrollmentRow,
    paidOrder: context.paidOrder,
    linkedOrder: context.linkedOrder,
    userAccountStatus: context.userAccountStatus,
  });

  if (result.eligible) {
    return result;
  }

  logPaymentSessionEligibilityRejection({
    enrollmentId: Number(enrollmentRow.id),
    userId: Number(enrollmentRow.user_id),
    code: result.code,
    reason: result.reason,
  });

  throw new ApiError(409, result.message, {
    code: result.code,
    reason: result.reason,
  });
}

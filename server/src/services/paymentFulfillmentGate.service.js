import {
  isOrderPayableFromWebhook,
  isTerminalNonPayableOrderStatus,
} from './orderStateMachine.service.js';
import { PAYMENT_SECURITY_EVENTS } from './paymentSecurityEvents.js';

/**
 * Pre-activation fulfillment gate (pure — unit-testable).
 *
 * @param {{
 *   order: { id: number|string, status: string, enrollment_id?: number|null },
 *   enrollment: { id: number|string, order_id?: number|null }|null,
 *   settlementOk: boolean,
 * }} input
 * @returns {{
 *   eligible: boolean,
 *   reason: string,
 *   securityEvent?: string,
 *   action: 'fulfill'|'duplicate'|'stale_order'|'settlement_rejected'|'not_pending'|'not_current_order'|'missing_enrollment',
 * }}
 */
export function evaluatePaymentFulfillmentEligibility({ order, enrollment, settlementOk }) {
  const orderId = Number(order?.id);
  const orderStatus = String(order?.status || '').toLowerCase();

  if (orderStatus === 'paid') {
    return { eligible: false, reason: 'already_paid', action: 'duplicate' };
  }

  if (!enrollment) {
    return { eligible: false, reason: 'enrollment_not_found', action: 'missing_enrollment' };
  }

  if (isTerminalNonPayableOrderStatus(orderStatus)) {
    return {
      eligible: false,
      reason: `order_status_${orderStatus}`,
      securityEvent: PAYMENT_SECURITY_EVENTS.STALE_ORDER_PAYMENT_ATTEMPT,
      action: 'stale_order',
    };
  }

  if (!isOrderPayableFromWebhook(orderStatus)) {
    return {
      eligible: false,
      reason: `order_not_pending:${orderStatus}`,
      securityEvent: PAYMENT_SECURITY_EVENTS.NON_PENDING_ORDER_FULFILLMENT_BLOCKED,
      action: 'not_pending',
    };
  }

  const enrollmentOrderId = enrollment.order_id == null ? null : Number(enrollment.order_id);
  if (!enrollmentOrderId || enrollmentOrderId !== orderId) {
    return {
      eligible: false,
      reason: 'enrollment_order_mismatch',
      securityEvent: PAYMENT_SECURITY_EVENTS.ORDER_NOT_CURRENT_FOR_ENROLLMENT,
      action: 'not_current_order',
    };
  }

  if (!settlementOk) {
    return { eligible: false, reason: 'settlement_rejected', action: 'settlement_rejected' };
  }

  return { eligible: true, reason: 'eligible', action: 'fulfill' };
}

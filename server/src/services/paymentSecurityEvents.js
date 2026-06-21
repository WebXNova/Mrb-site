import { StructuredLogger } from '../utils/requestId.js';

const logger = new StructuredLogger({ service: 'paymentSecurityEvents' });

/**
 * Structured security audit events for payment / checkout integrity.
 * @param {string} event
 * @param {Record<string, unknown>} [detail]
 */
export function logPaymentSecurityEvent(event, detail = {}) {
  logger.warn('Payment security event', {
    securityEvent: event,
    ...detail,
  });
}

export const PAYMENT_SECURITY_EVENTS = Object.freeze({
  STALE_ORDER_PAYMENT_ATTEMPT: 'STALE_ORDER_PAYMENT_ATTEMPT',
  ORDER_NOT_CURRENT_FOR_ENROLLMENT: 'ORDER_NOT_CURRENT_FOR_ENROLLMENT',
  NON_PENDING_ORDER_FULFILLMENT_BLOCKED: 'NON_PENDING_ORDER_FULFILLMENT_BLOCKED',
  DUPLICATE_PENDING_ORDER_PREVENTED: 'DUPLICATE_PENDING_ORDER_PREVENTED',
  PAYMENT_SESSION_INELIGIBLE: 'PAYMENT_SESSION_INELIGIBLE',
  PAYMENT_CHECKOUT_RATE_LIMITED: 'PAYMENT_CHECKOUT_RATE_LIMITED',
  SAFEPAY_WEBHOOK_REPLAY_BLOCKED: 'SAFEPAY_WEBHOOK_REPLAY_BLOCKED',
  SAFEPAY_WEBHOOK_DUPLICATE: 'SAFEPAY_WEBHOOK_DUPLICATE',
  SAFEPAY_WEBHOOK_REDIS_UNAVAILABLE: 'SAFEPAY_WEBHOOK_REDIS_UNAVAILABLE',
  SAFEPAY_WEBHOOK_REDIS_RECOVERY: 'SAFEPAY_WEBHOOK_REDIS_RECOVERY',
});

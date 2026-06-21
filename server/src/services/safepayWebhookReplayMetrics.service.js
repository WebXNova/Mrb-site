/**
 * H-04/H-05 — Safepay webhook replay metrics (in-process counters + structured logs).
 */

import { StructuredLogger } from '../utils/requestId.js';
import {
  logPaymentSecurityEvent,
  PAYMENT_SECURITY_EVENTS,
} from './paymentSecurityEvents.js';

const logger = new StructuredLogger({ service: 'safepayWebhookReplayMetrics' });

const counters = {
  duplicateWebhookCount: 0,
  replayAttempts: 0,
  blockedEvents: 0,
  redisUnavailableCount: 0,
  blockedWebhooksWithoutFulfillment: 0,
  redisRecoveryCount: 0,
};

function bump(field) {
  counters[field] += 1;
}

export function getSafepayWebhookReplayMetrics() {
  return { ...counters };
}

export function resetSafepayWebhookReplayMetricsForTests() {
  counters.duplicateWebhookCount = 0;
  counters.replayAttempts = 0;
  counters.blockedEvents = 0;
  counters.redisUnavailableCount = 0;
  counters.blockedWebhooksWithoutFulfillment = 0;
  counters.redisRecoveryCount = 0;
}

/**
 * @param {{
 *   reason: string,
 *   webhookHash: string,
 *   requestId?: string|null,
 *   userId?: number|null,
 *   enrollmentId?: number|null,
 *   orderId?: number|null,
 *   endpoint?: string,
 * }} detail
 */
export function logSafepayWebhookReplayBlocked(detail) {
  bump('blockedEvents');
  if (detail.reason === 'db_already_processed' || detail.reason === 'db_duplicate_insert') {
    bump('duplicateWebhookCount');
  }
  if (detail.reason === 'redis_replay' || detail.reason === 'redis_set_nx_conflict') {
    bump('replayAttempts');
  }

  const payload = {
    endpoint: detail.endpoint ?? '/api/payments/webhook',
    webhookHashPrefix: String(detail.webhookHash || '').slice(0, 12),
    reason: detail.reason,
    requestId: detail.requestId ?? null,
    userId: detail.userId ?? null,
    enrollmentId: detail.enrollmentId ?? null,
    orderId: detail.orderId ?? null,
    timestamp: new Date().toISOString(),
    metrics: getSafepayWebhookReplayMetrics(),
  };

  logger.warn('Safepay webhook replay blocked', payload);
  logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.SAFEPAY_WEBHOOK_REPLAY_BLOCKED, payload);
}

/**
 * @param {{ webhookHash: string, requestId?: string|null, layer: 'redis' | 'database' }} detail
 */
export function recordSafepayWebhookReplayDuplicate(detail) {
  bump('duplicateWebhookCount');
  bump('replayAttempts');

  logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.SAFEPAY_WEBHOOK_DUPLICATE, {
    layer: detail.layer,
    webhookHashPrefix: String(detail.webhookHash || '').slice(0, 12),
    requestId: detail.requestId ?? null,
    timestamp: new Date().toISOString(),
    metrics: getSafepayWebhookReplayMetrics(),
  });
}

/**
 * @param {{ reason: string, requestId?: string|null }} detail
 */
export function logSafepayWebhookRedisUnavailable(detail) {
  bump('redisUnavailableCount');
  bump('blockedWebhooksWithoutFulfillment');
  bump('blockedEvents');

  const payload = {
    event: 'SAFEPAY_WEBHOOK_REDIS_UNAVAILABLE',
    reason: detail.reason,
    requestId: detail.requestId ?? null,
    timestamp: new Date().toISOString(),
    metrics: getSafepayWebhookReplayMetrics(),
  };

  logger.warn('Safepay webhook blocked — Redis unavailable (fail-closed)', payload);
  logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.SAFEPAY_WEBHOOK_REDIS_UNAVAILABLE, payload);
}

/**
 * @param {{ requestId?: string|null, source?: string }} [detail]
 */
export function logSafepayWebhookRedisRecovery(detail = {}) {
  bump('redisRecoveryCount');

  const payload = {
    event: 'SAFEPAY_WEBHOOK_REDIS_RECOVERY',
    source: detail.source ?? 'redis_ready',
    requestId: detail.requestId ?? null,
    timestamp: new Date().toISOString(),
    metrics: getSafepayWebhookReplayMetrics(),
  };

  logger.info('Safepay webhook replay protection — Redis recovered', payload);
  logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.SAFEPAY_WEBHOOK_REDIS_RECOVERY, payload);
}

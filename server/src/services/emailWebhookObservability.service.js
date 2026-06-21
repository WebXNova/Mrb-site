import { StructuredLogger } from '../utils/requestId.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';

const logger = new StructuredLogger({ service: 'emailWebhookObservability' });

/**
 * @param {'success' | 'failure' | 'security'} outcome
 * @param {string} event
 * @param {Record<string, unknown>} [meta]
 */
export function emitEmailWebhookAudit(outcome, event, meta = {}) {
  const payload = sanitizeMetadata({
    schemaVersion: 'email.webhook.audit.1',
    tag: 'email.webhook.audit',
    timestamp: new Date().toISOString(),
    outcome,
    event,
    ...meta,
  });
  if (outcome === 'failure' || outcome === 'security') {
    logger.warn(event, payload);
  } else {
    logger.info(event, payload);
  }
}

export function logEmailWebhookSecurityFailure(req, code, extra = {}) {
  emitEmailWebhookAudit('security', 'EMAIL_WEBHOOK_SECURITY_REJECTED', {
    code,
    requestId: req.requestId ?? null,
    route: req.originalUrl ?? null,
    ip: req.ip ?? null,
    ...extra,
  });
}

export function logEmailWebhookSuccess(req, meta = {}) {
  emitEmailWebhookAudit('success', 'EMAIL_WEBHOOK_PROCESSED', {
    requestId: req.requestId ?? null,
    route: req.originalUrl ?? null,
    ...meta,
  });
}

export function logEmailWebhookFailure(req, code, meta = {}) {
  emitEmailWebhookAudit('failure', 'EMAIL_WEBHOOK_PROCESSING_FAILED', {
    code,
    requestId: req.requestId ?? null,
    route: req.originalUrl ?? null,
    ...meta,
  });
}

import { env } from '../config/env.js';
import { getQaAuditLogConfig } from '../config/qaAuditLog.config.js';
import {
  QA_AUDIT_SCHEMA_VERSION,
  inferQaAuditCategory,
} from '../constants/qaAudit.schema.js';
import {
  recordQaAuditSuccess,
  recordQaAuditRetry,
  recordQaAuditFailure,
  recordQaAuditAlert,
  shouldEmitQaAuditAlert,
} from '../observability/qaAuditMetrics.service.js';
import { insertActivityLogRecord } from './activityLog.service.js';
import { writeQaAuditDeadLetter } from './qaAuditDeadLetter.service.js';
import { sanitizeMetadata, sanitizePath } from '../utils/logSanitizer.js';
import { getClientIp } from '../utils/network.js';

const LOG_PREFIX = '[qa.audit]';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {'INFO'|'WARN'|'ERROR'} level
 * @param {Record<string, unknown>} payload
 */
function emitStructuredConsole(level, payload) {
  const line = JSON.stringify({
    level,
    component: 'qa_audit',
    schemaVersion: QA_AUDIT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
    ...payload,
  });

  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

/**
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [extra]
 */
export function buildQaAuditRequestContext(req, extra = {}) {
  return sanitizeMetadata({
    route: sanitizePath(req?.originalUrl || req?.path || null),
    ipAddress: req ? getClientIp(req) : null,
    userAgent: req?.get?.('user-agent') || null,
    sessionId: req?.user?.sid ?? null,
    requestId: req?.requestId ?? null,
    ...extra,
  });
}

/**
 * Hardened Q&A audit writer — retries, dead-letter, metrics, and alerts.
 * Never throws; failures are always surfaced through DLQ, metrics, and ERROR logs.
 *
 * @param {{
 *   userId?: number|null,
 *   role?: string,
 *   action: string,
 *   entityType?: string,
 *   entityId?: string|null,
 *   eventCategory?: string,
 *   metadata?: Record<string, unknown>,
 *   requestId?: string|null,
 * }} input
 * @returns {Promise<{ ok: boolean, persisted: boolean, dlq: boolean }>}
 */
export async function writeQaAuditEvent({
  userId = null,
  role = 'system',
  action,
  entityType = 'student_question',
  entityId = null,
  eventCategory,
  metadata = {},
  requestId = null,
}) {
  const config = getQaAuditLogConfig();
  const category = eventCategory || inferQaAuditCategory(action);
  const safeMetadata = sanitizeMetadata({
    eventCategory: category,
    requestId: requestId ?? metadata.requestId ?? null,
    ...metadata,
  });

  const record = {
    userId,
    role,
    action,
    entityType,
    entityId,
    eventCategory: category,
    metadata: safeMetadata,
  };

  let lastError = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt += 1) {
    try {
      await insertActivityLogRecord({
        userId,
        role,
        action,
        entityType,
        entityId,
        metadata: safeMetadata,
      });

      recordQaAuditSuccess(action, category);

      if (config.stdoutEnabled || env.nodeEnv !== 'production') {
        emitStructuredConsole('INFO', {
          event: 'persisted',
          action,
          eventCategory: category,
          userId,
          role,
          entityType,
          entityId,
          attempt,
        });
      }

      return { ok: true, persisted: true, dlq: false };
    } catch (error) {
      lastError = error;
      if (attempt < config.maxRetries) {
        recordQaAuditRetry(action);
        await sleep(config.retryDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  recordQaAuditFailure(action, category);

  const dlqOk = await writeQaAuditDeadLetter({
    record,
    error: lastError,
    attempts: config.maxRetries,
  });

  emitStructuredConsole('ERROR', {
    alert: 'qa_audit_persist_failed',
    event: 'persist_failed',
    action,
    eventCategory: category,
    userId,
    role,
    entityType,
    entityId,
    attempts: config.maxRetries,
    dlqWritten: dlqOk,
    error: lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown'),
  });

  if (shouldEmitQaAuditAlert(config.alertWindowMs, config.alertThreshold)) {
    recordQaAuditAlert();
    emitStructuredConsole('ERROR', {
      alert: 'qa_audit_failure_threshold_exceeded',
      event: 'threshold_alert',
      windowMs: config.alertWindowMs,
      threshold: config.alertThreshold,
      message: 'Q&A audit persist failure rate exceeded configured threshold',
    });
  }

  return { ok: false, persisted: false, dlq: dlqOk };
}

/**
 * @param {import('express').Request} req
 * @param {Omit<Parameters<typeof writeQaAuditEvent>[0], 'metadata'|'requestId'> & { metadata?: Record<string, unknown> }} input
 */
export async function writeQaAuditEventFromReq(req, input) {
  return writeQaAuditEvent({
    userId: input.userId ?? req?.user?.id ?? null,
    role: input.role ?? req?.user?.role ?? 'system',
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    eventCategory: input.eventCategory,
    requestId: req?.requestId ?? null,
    metadata: buildQaAuditRequestContext(req, input.metadata ?? {}),
  });
}

export { LOG_PREFIX };

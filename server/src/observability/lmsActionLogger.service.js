/**
 * Structured JSON logger for critical LMS admin actions (import, publish, test CRUD).
 *
 * Output: single-line JSON to stdout/stderr (SIEM-friendly).
 * Optional: mirror to activity_logs when LMS_ACTION_DB_PERSIST !== 'false'.
 */

import { logActivity } from '../services/activityLog.service.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';
import { LMS_ACTION_EVENTS } from './lmsActionEvents.js';

const SERVICE = 'lms';

const EVENT_ACTIVITY_MAP = Object.freeze({
  [LMS_ACTION_EVENTS.IMPORT_STARTED]: {
    action: 'lms.import.started',
    entityType: 'question_import_batch',
  },
  [LMS_ACTION_EVENTS.IMPORT_COMPLETED]: {
    action: 'lms.import.completed',
    entityType: 'question_import_batch',
  },
  [LMS_ACTION_EVENTS.IMPORT_FAILED]: {
    action: 'lms.import.failed',
    entityType: 'question_import_batch',
  },
  [LMS_ACTION_EVENTS.TEST_EXPORT_STARTED]: {
    action: 'lms.test.export.started',
    entityType: 'test',
  },
  [LMS_ACTION_EVENTS.TEST_EXPORT_COMPLETED]: {
    action: 'lms.test.export.completed',
    entityType: 'test',
  },
  [LMS_ACTION_EVENTS.TEST_EXPORT_FAILED]: {
    action: 'lms.test.export.failed',
    entityType: 'test',
  },
  [LMS_ACTION_EVENTS.TEST_IMPORT_STARTED]: {
    action: 'lms.test.import.started',
    entityType: 'test_import_batch',
  },
  [LMS_ACTION_EVENTS.TEST_IMPORT_COMPLETED]: {
    action: 'lms.test.import.completed',
    entityType: 'test_import_batch',
  },
  [LMS_ACTION_EVENTS.TEST_IMPORT_FAILED]: {
    action: 'lms.test.import.failed',
    entityType: 'test_import_batch',
  },
  [LMS_ACTION_EVENTS.PUBLISH_STARTED]: {
    action: 'lms.publish.started',
    entityType: 'test',
  },
  [LMS_ACTION_EVENTS.PUBLISH_COMPLETED]: {
    action: 'lms.publish.completed',
    entityType: 'test',
  },
  [LMS_ACTION_EVENTS.TEST_CREATED]: {
    action: 'lms.test.created',
    entityType: 'test',
  },
  [LMS_ACTION_EVENTS.TEST_UPDATED]: {
    action: 'lms.test.updated',
    entityType: 'test',
  },
});

function dbPersistEnabled() {
  return String(process.env.LMS_ACTION_DB_PERSIST ?? 'false').toLowerCase() === 'true';
}

/**
 * @param {Record<string, unknown>} payload
 */
function normalizeActionPayload(payload) {
  const safe = sanitizeMetadata(payload ?? {});
  const userId = safe.userId != null ? Number(safe.userId) : null;
  const entityId = safe.entityId ?? safe.testId ?? safe.batchId ?? null;

  return {
    ...safe,
    userId: Number.isFinite(userId) && userId > 0 ? userId : safe.userId ?? null,
    entityId: entityId != null ? String(entityId) : null,
  };
}

/**
 * @param {'info'|'warn'|'error'} level
 * @param {Record<string, unknown>} payload
 */
function emit(level, payload) {
  const normalized = normalizeActionPayload(payload);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE,
    ...normalized,
  };

  if (!entry.event) {
    entry.event = 'LMS_ACTION_UNSPECIFIED';
  }

  const stream = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  stream(JSON.stringify(entry));

  if (dbPersistEnabled()) {
    void persistActionToActivityLog(entry);
  }

  return entry;
}

/**
 * @param {Record<string, unknown>} entry
 */
async function persistActionToActivityLog(entry) {
  const mapping = EVENT_ACTIVITY_MAP[entry.event];
  if (!mapping) return;

  const { event, timestamp, level, service, userId, entityId, ...metadata } = entry;

  try {
    await logActivity({
      userId: typeof userId === 'number' ? userId : null,
      role: metadata.role ?? 'admin',
      action: mapping.action,
      entityType: mapping.entityType,
      entityId: entityId != null ? String(entityId) : null,
      metadata: {
        event,
        level,
        service,
        timestamp,
        ...metadata,
      },
    });
  } catch {
    // logActivity already swallows errors; guard future throws.
  }
}

export const lmsActionLogger = Object.freeze({
  info(payload) {
    return emit('info', payload);
  },
  warn(payload) {
    return emit('warn', payload);
  },
  error(payload) {
    return emit('error', payload);
  },
});

/**
 * @param {Record<string, unknown>} payload
 */
export function logImportStarted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.IMPORT_STARTED,
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logImportCompleted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.IMPORT_COMPLETED,
    outcome: 'success',
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logImportFailed(payload) {
  return lmsActionLogger.error({
    event: LMS_ACTION_EVENTS.IMPORT_FAILED,
    outcome: 'failure',
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logPublishStarted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.PUBLISH_STARTED,
    phase: 'request',
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logPublishCompleted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.PUBLISH_COMPLETED,
    phase: 'complete',
    outcome: 'success',
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logTestCreated(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.TEST_CREATED,
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logTestUpdated(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.TEST_UPDATED,
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
export function logTestExportStarted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.TEST_EXPORT_STARTED,
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
export function logTestExportCompleted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.TEST_EXPORT_COMPLETED,
    outcome: 'success',
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
export function logTestExportFailed(payload) {
  return lmsActionLogger.error({
    event: LMS_ACTION_EVENTS.TEST_EXPORT_FAILED,
    outcome: 'failure',
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
export function logTestImportStarted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.TEST_IMPORT_STARTED,
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
export function logTestImportCompleted(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.TEST_IMPORT_COMPLETED,
    outcome: 'success',
    ...payload,
  });
}

/** @param {Record<string, unknown>} payload */
export function logTestImportFailed(payload) {
  return lmsActionLogger.error({
    event: LMS_ACTION_EVENTS.TEST_IMPORT_FAILED,
    outcome: 'failure',
    ...payload,
  });
}

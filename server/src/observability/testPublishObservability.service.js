/**
 * G-09 — structured publish diagnostics (JSON logs for SRE / SIEM).
 */

import { lmsActionLogger } from './lmsActionLogger.service.js';
import { LMS_ACTION_EVENTS } from './lmsActionEvents.js';

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
export function logPublishMaterialized(payload) {
  return lmsActionLogger.info({
    event: 'PUBLISH_MATERIALIZED',
    phase: 'materialization',
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logPublishSucceeded(payload) {
  return logPublishCompleted(payload);
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
export function logPublishReplay(payload) {
  return lmsActionLogger.info({
    event: LMS_ACTION_EVENTS.PUBLISH_COMPLETED,
    phase: 'complete',
    outcome: 'success',
    idempotentReplay: true,
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logPublishFailed(payload) {
  return lmsActionLogger.error({
    event: 'PUBLISH_FAILED',
    phase: 'error',
    outcome: 'failure',
    ...payload,
  });
}

/**
 * @param {Record<string, unknown>} payload
 */
export function logPublishStudentReadiness(payload) {
  return lmsActionLogger.info({
    event: 'PUBLISH_STUDENT_READINESS',
    phase: 'readiness',
    ...payload,
  });
}

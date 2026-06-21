/**
 * Safepay webhook event classification — FAIL-CLOSED settlement gate.
 *
 * Only events in ALLOWED_SUCCESS_* may trigger order fulfillment.
 * Unknown / missing identifiers are ignored (logged, not fulfilled).
 * Empty or non-object payloads are rejected.
 */

import { StructuredLogger } from '../utils/requestId.js';

/** @typedef {'success' | 'failure' | 'ignored' | 'rejected'} WebhookEventOutcome */

/**
 * Canonical allowlist — explicit payment-success event type strings (lowercase).
 * Extend only after Safepay documentation confirms settlement semantics.
 */
export const ALLOWED_SUCCESS_EVENT_TYPES = Object.freeze([
  'payment.succeeded',
  'payments.succeeded',
]);

/**
 * Canonical allowlist — explicit tracker terminal states (uppercase).
 */
export const ALLOWED_SUCCESS_TRACKER_STATES = Object.freeze(['TRACKER_ENDED']);

/**
 * Combined documentation export (types + states).
 */
export const ALLOWED_SUCCESS_EVENTS = Object.freeze([
  ...ALLOWED_SUCCESS_EVENT_TYPES,
  ...ALLOWED_SUCCESS_TRACKER_STATES,
]);

/**
 * Explicit non-settlement events that may mark a pending order failed.
 */
export const KNOWN_FAILURE_EVENT_TYPES = Object.freeze([
  'payment.failed',
  'payment.canceled',
  'payment.cancelled',
]);

export const KNOWN_FAILURE_TRACKER_STATES = Object.freeze([]);

const logger = new StructuredLogger({ service: 'safepayWebhookEventValidation' });

/**
 * @param {unknown} payload
 * @returns {{ type: string, state: string, typeRaw: string|null, stateRaw: string|null }}
 */
export function extractSafepayWebhookEventFields(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { type: '', state: '', typeRaw: null, stateRaw: null };
  }

  const typeRaw =
    payload.type ?? payload.event ?? payload.event_type ?? null;
  const stateRaw =
    payload?.data?.tracker?.state ?? payload?.data?.state ?? payload?.tracker?.state ?? null;

  const type = typeRaw == null || String(typeRaw).trim() === '' ? '' : String(typeRaw).trim().toLowerCase();
  const state = stateRaw == null || String(stateRaw).trim() === '' ? '' : String(stateRaw).trim().toUpperCase();

  return {
    type,
    state,
    typeRaw: typeRaw == null ? null : String(typeRaw),
    stateRaw: stateRaw == null ? null : String(stateRaw),
  };
}

/**
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isEmptySafepayWebhookPayload(payload) {
  if (payload == null) return true;
  if (typeof payload !== 'object' || Array.isArray(payload)) return true;
  return Object.keys(payload).length === 0;
}

/**
 * Fail-closed classifier for Safepay webhook settlement.
 *
 * @param {unknown} payload
 * @returns {{
 *   outcome: WebhookEventOutcome,
 *   reason: string,
 *   type: string,
 *   state: string,
 *   typeRaw: string|null,
 *   stateRaw: string|null,
 * }}
 */
export function classifySafepayWebhookEvent(payload) {
  if (isEmptySafepayWebhookPayload(payload)) {
    return {
      outcome: 'rejected',
      reason: 'empty_or_invalid_payload',
      type: '',
      state: '',
      typeRaw: null,
      stateRaw: null,
    };
  }

  const { type, state, typeRaw, stateRaw } = extractSafepayWebhookEventFields(payload);

  if (!type && !state) {
    return {
      outcome: 'ignored',
      reason: 'missing_type_and_state',
      type,
      state,
      typeRaw,
      stateRaw,
    };
  }

  if (type && ALLOWED_SUCCESS_EVENT_TYPES.includes(type)) {
    return {
      outcome: 'success',
      reason: 'allowed_event_type',
      type,
      state,
      typeRaw,
      stateRaw,
    };
  }

  if (state && ALLOWED_SUCCESS_TRACKER_STATES.includes(state)) {
    return {
      outcome: 'success',
      reason: 'allowed_tracker_state',
      type,
      state,
      typeRaw,
      stateRaw,
    };
  }

  if (type && KNOWN_FAILURE_EVENT_TYPES.includes(type)) {
    return {
      outcome: 'failure',
      reason: 'known_failure_event_type',
      type,
      state,
      typeRaw,
      stateRaw,
    };
  }

  if (state && KNOWN_FAILURE_TRACKER_STATES.includes(state)) {
    return {
      outcome: 'failure',
      reason: 'known_failure_tracker_state',
      type,
      state,
      typeRaw,
      stateRaw,
    };
  }

  return {
    outcome: 'ignored',
    reason: type ? 'unknown_event_type' : 'unknown_tracker_state',
    type,
    state,
    typeRaw,
    stateRaw,
  };
}

/**
 * Backward-compatible boolean gate — true only for explicit allowlisted success events.
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isSafepayPaymentSuccessEvent(payload) {
  return classifySafepayWebhookEvent(payload).outcome === 'success';
}

/**
 * Structured security audit log for webhook event decisions.
 * @param {ReturnType<typeof classifySafepayWebhookEvent>} classification
 * @param {{ orderId?: number|null, requestId?: string|null, enrollmentId?: number|null }} [context]
 */
export function logSafepayWebhookEventDecision(classification, context = {}) {
  const { orderId = null, requestId = null, enrollmentId = null } = context;
  const base = {
    event: 'SAFEPAY_WEBHOOK_EVENT_CLASSIFIED',
    outcome: classification.outcome,
    reason: classification.reason,
    type: classification.typeRaw ?? classification.type ?? null,
    state: classification.stateRaw ?? classification.state ?? null,
    orderId,
    enrollmentId,
    requestId,
  };

  if (classification.outcome === 'success') {
    logger.info('Settlement event accepted', base);
    return;
  }

  if (classification.outcome === 'failure') {
    logger.warn('Settlement failure event', base);
    return;
  }

  if (classification.outcome === 'rejected') {
    logger.warn('Webhook payload rejected', base);
    return;
  }

  logger.warn('Webhook event ignored — no fulfillment', base);
}

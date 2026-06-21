/**
 * Safepay webhook settlement verification — amount + currency must match orders row.
 *
 * Canonical contract:
 * - orders.amount / orders.currency are major units (PKR rupees) set at session creation.
 * - Safepay session API uses minor units (paisa); webhooks may report minor OR major.
 * - Settlement accepts exact minor match OR exact major match only (no rounding tolerance).
 */

import { StructuredLogger } from '../utils/requestId.js';
import { evaluatePaymentFulfillmentEligibility } from './paymentFulfillmentGate.service.js';

const logger = new StructuredLogger({ service: 'safepayWebhookSettlement' });

/**
 * @param {number} amountMajor
 * @returns {number}
 */
export function majorUnitsToMinorUnits(amountMajor) {
  const n = Number(amountMajor);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Invalid major unit amount');
  }
  return Math.round(n * 100);
}

/**
 * @param {unknown} code
 * @returns {string}
 */
export function normalizeCurrencyCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * @param {unknown} payload
 * @returns {number|null}
 */
export function extractSafepayPaidAmountFromWebhook(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload?.data?.amount,
    payload?.data?.paid_amount,
    payload?.data?.captured_amount,
    payload?.data?.tracker?.amount,
    payload?.data?.payment?.amount,
    payload?.payment?.amount,
    payload?.amount,
  ];
  for (const value of candidates) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * @param {unknown} payload
 * @returns {string|null}
 */
export function extractSafepayPaidCurrencyFromWebhook(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload?.data?.currency,
    payload?.data?.tracker?.currency,
    payload?.data?.payment?.currency,
    payload?.payment?.currency,
    payload?.currency,
  ];
  for (const value of candidates) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    return normalizeCurrencyCode(value);
  }
  return null;
}

/**
 * @param {number} rawAmount
 * @param {number} orderAmountMajor
 * @returns {{ matches: boolean, matchKind: 'minor'|'major'|null, expectedMinor: number }}
 */
export function comparePaidAmountToOrder(rawAmount, orderAmountMajor) {
  const paid = Number(rawAmount);
  const orderMajor = Number(orderAmountMajor);
  const expectedMinor = majorUnitsToMinorUnits(orderMajor);

  if (!Number.isFinite(paid)) {
    return { matches: false, matchKind: null, expectedMinor };
  }

  if (!Number.isInteger(paid)) {
    return { matches: false, matchKind: null, expectedMinor };
  }

  if (paid === expectedMinor) {
    return { matches: true, matchKind: 'minor', expectedMinor };
  }

  if (paid === orderMajor) {
    return { matches: true, matchKind: 'major', expectedMinor };
  }

  return { matches: false, matchKind: null, expectedMinor };
}

/**
 * @typedef {object} SettlementVerificationResult
 * @property {boolean} ok
 * @property {string} reason
 * @property {string} [code]
 * @property {number|null} [orderAmountMajor]
 * @property {number|null} [paidAmountRaw]
 * @property {string|null} [orderCurrency]
 * @property {string|null} [paidCurrency]
 * @property {number|null} [expectedMinor]
 */

/**
 * @param {{ amount: number|string, currency?: string|null }} order
 * @param {unknown} payload
 * @returns {SettlementVerificationResult}
 */
export function verifyWebhookSettlementAgainstOrder(order, payload) {
  const orderAmountMajor = Number(order?.amount);
  const orderCurrency = normalizeCurrencyCode(order?.currency || 'PKR');

  if (!Number.isFinite(orderAmountMajor) || orderAmountMajor <= 0) {
    return {
      ok: false,
      reason: 'invalid_order_amount',
      code: 'SETTLEMENT_ORDER_INVALID',
      orderAmountMajor: null,
      paidAmountRaw: null,
      orderCurrency,
      paidCurrency: null,
      expectedMinor: null,
    };
  }

  const paidAmountRaw = extractSafepayPaidAmountFromWebhook(payload);
  if (paidAmountRaw === null) {
    return {
      ok: false,
      reason: 'missing_paid_amount',
      code: 'SETTLEMENT_AMOUNT_MISSING',
      orderAmountMajor,
      paidAmountRaw: null,
      orderCurrency,
      paidCurrency: extractSafepayPaidCurrencyFromWebhook(payload),
      expectedMinor: majorUnitsToMinorUnits(orderAmountMajor),
    };
  }

  const paidCurrency = extractSafepayPaidCurrencyFromWebhook(payload);
  if (!paidCurrency) {
    return {
      ok: false,
      reason: 'missing_paid_currency',
      code: 'SETTLEMENT_CURRENCY_MISSING',
      orderAmountMajor,
      paidAmountRaw,
      orderCurrency,
      paidCurrency: null,
      expectedMinor: majorUnitsToMinorUnits(orderAmountMajor),
    };
  }

  if (paidCurrency !== orderCurrency) {
    return {
      ok: false,
      reason: 'currency_mismatch',
      code: 'SETTLEMENT_CURRENCY_MISMATCH',
      orderAmountMajor,
      paidAmountRaw,
      orderCurrency,
      paidCurrency,
      expectedMinor: majorUnitsToMinorUnits(orderAmountMajor),
    };
  }

  if (!Number.isInteger(paidAmountRaw)) {
    return {
      ok: false,
      reason: 'decimal_amount_rejected',
      code: 'SETTLEMENT_DECIMAL_MISMATCH',
      orderAmountMajor,
      paidAmountRaw,
      orderCurrency,
      paidCurrency,
      expectedMinor: majorUnitsToMinorUnits(orderAmountMajor),
    };
  }

  const comparison = comparePaidAmountToOrder(paidAmountRaw, orderAmountMajor);
  if (!comparison.matches) {
    const expectedMinor = comparison.expectedMinor;
    const reason =
      paidAmountRaw < expectedMinor && paidAmountRaw !== orderAmountMajor
        ? 'amount_too_low'
        : paidAmountRaw > expectedMinor
          ? 'amount_too_high'
          : 'amount_mismatch';
    return {
      ok: false,
      reason,
      code: 'SETTLEMENT_AMOUNT_MISMATCH',
      orderAmountMajor,
      paidAmountRaw,
      orderCurrency,
      paidCurrency,
      expectedMinor,
    };
  }

  return {
    ok: true,
    reason: 'settlement_verified',
    code: 'SETTLEMENT_OK',
    orderAmountMajor,
    paidAmountRaw,
    orderCurrency,
    paidCurrency,
    expectedMinor: comparison.expectedMinor,
  };
}

/**
 * @param {SettlementVerificationResult} result
 * @param {{ orderId?: number|null, requestId?: string|null }} [context]
 */
export function logSettlementVerification(result, context = {}) {
  const base = {
    event: 'SAFEPAY_WEBHOOK_SETTLEMENT',
    ok: result.ok,
    reason: result.reason,
    code: result.code,
    orderId: context.orderId ?? null,
    requestId: context.requestId ?? null,
    orderAmountMajor: result.orderAmountMajor,
    paidAmountRaw: result.paidAmountRaw,
    orderCurrency: result.orderCurrency,
    paidCurrency: result.paidCurrency,
    expectedMinor: result.expectedMinor,
  };
  if (result.ok) {
    logger.info('Settlement verified', base);
  } else {
    logger.warn('Settlement rejected — no fulfillment', base);
  }
}

/**
 * Fulfillment gate helper for tests — event + settlement + checkout integrity.
 * @param {{ outcome: string }} classification
 * @param {{ status: string, amount: number, currency?: string, id?: number }} order
 * @param {unknown} payload
 * @param {{ order_id?: number|null, id?: number }|null} [enrollment]
 * @returns {{ action: string, enrolls: boolean, reason?: string }}
 */
export function resolveFulfillmentWithSettlement(classification, order, payload, enrollment = null) {
  if (classification.outcome === 'rejected') {
    return { action: 'reject', enrolls: false, reason: classification.reason };
  }
  if (classification.outcome === 'ignored') {
    return { action: 'ignored', enrolls: false, reason: classification.reason };
  }
  if (classification.outcome === 'failure') {
    return { action: 'mark_failed', enrolls: false, reason: classification.reason };
  }
  if (classification.outcome !== 'success') {
    return { action: 'ignored', enrolls: false, reason: classification.reason };
  }

  const settlement = verifyWebhookSettlementAgainstOrder(order, payload);
  const enrollmentRow =
    enrollment ??
    (order.id != null ? { id: order.id, order_id: order.id } : null);

  const eligibility = evaluatePaymentFulfillmentEligibility({
    order: { id: order.id ?? enrollmentRow?.order_id ?? 0, status: order.status, enrollment_id: enrollmentRow?.id },
    enrollment: enrollmentRow,
    settlementOk: settlement.ok,
  });

  if (!eligibility.eligible) {
    const action =
      eligibility.action === 'duplicate'
        ? 'duplicate'
        : eligibility.action === 'settlement_rejected'
          ? 'settlement_rejected'
          : eligibility.action === 'not_current_order' || eligibility.action === 'stale_order'
            ? 'stale_order'
            : 'fulfillment_rejected';
    return { action, enrolls: false, reason: eligibility.reason };
  }

  return { action: 'fulfill', enrolls: true, reason: 'settlement_verified' };
}

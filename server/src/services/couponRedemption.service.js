/**
 * Coupon validation and redemption for COURSE manual payment checkout only.
 *
 * Phase 4 decision: coupons stay course-scoped (assertCouponEligibility requires course_id).
 * Paid standalone test orders do not accept coupons. Do not apply course coupons to
 * standalone_test product records.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { sanitizeCouponCode } from '../validators/coupon.schema.js';

export const COUPON_VALIDATION_MESSAGES = Object.freeze({
  NOT_FOUND: 'Coupon code not found.',
  INACTIVE: 'This coupon is no longer active.',
  WRONG_COURSE: 'This coupon is not valid for this course.',
  NOT_YET_ACTIVE: 'This coupon is not yet active.',
  EXPIRED: 'This coupon has expired.',
  USAGE_LIMIT: 'This coupon has reached its usage limit.',
});

/**
 * @returns {string} YYYY-MM-DD in server local time
 */
export function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * @param {number} originalAmount
 * @param {'flat'|'percentage'} discountType
 * @param {number} discountValue
 */
export function computeCouponDiscount(originalAmount, discountType, discountValue) {
  const original = Math.round(Number(originalAmount));
  if (!Number.isFinite(original) || original <= 0) {
    throw new ApiError(422, 'Order amount is invalid for coupon discount', {
      code: 'INVALID_ORDER_AMOUNT',
    });
  }

  let discountApplied;
  if (discountType === 'flat') {
    discountApplied = Math.min(original, Math.round(Number(discountValue)));
  } else {
    discountApplied = Math.round((original * Number(discountValue)) / 100);
  }

  discountApplied = Math.max(0, Math.min(original, discountApplied));
  const discountedAmount = original - discountApplied;

  return {
    originalAmount: original,
    discountApplied,
    discountedAmount,
  };
}

/**
 * @param {Record<string, unknown>} couponRow
 * @param {number} courseId
 * @param {string} [today= todayDateString()]
 */
export function assertCouponEligibility(couponRow, courseId, today = todayDateString()) {
  if (!couponRow) {
    throw new ApiError(404, COUPON_VALIDATION_MESSAGES.NOT_FOUND, { code: 'COUPON_NOT_FOUND' });
  }
  if (!Boolean(couponRow.is_active)) {
    throw new ApiError(422, COUPON_VALIDATION_MESSAGES.INACTIVE, { code: 'COUPON_INACTIVE' });
  }
  if (Number(couponRow.course_id) !== Number(courseId)) {
    throw new ApiError(422, COUPON_VALIDATION_MESSAGES.WRONG_COURSE, { code: 'COUPON_WRONG_COURSE' });
  }

  const validFrom = String(couponRow.valid_from).slice(0, 10);
  if (today < validFrom) {
    throw new ApiError(422, COUPON_VALIDATION_MESSAGES.NOT_YET_ACTIVE, { code: 'COUPON_NOT_YET_ACTIVE' });
  }

  const validUntil = couponRow.valid_until == null ? null : String(couponRow.valid_until).slice(0, 10);
  if (validUntil != null && today > validUntil) {
    throw new ApiError(422, COUPON_VALIDATION_MESSAGES.EXPIRED, { code: 'COUPON_EXPIRED' });
  }

  if (Number(couponRow.used_count) >= Number(couponRow.usage_limit)) {
    throw new ApiError(422, COUPON_VALIDATION_MESSAGES.USAGE_LIMIT, { code: 'COUPON_USAGE_LIMIT' });
  }
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} connection
 * @param {string} normalizedCode
 */
async function loadCouponByCode(connection, normalizedCode) {
  const [rows] = await connection.query(
    `SELECT id, code, course_id, discount_type, discount_value, usage_limit, used_count,
            valid_from, valid_until, is_active
     FROM coupons
     WHERE code = ?
     LIMIT 1`,
    [normalizedCode]
  );
  return rows[0] || null;
}

/**
 * Preview coupon for a pending order — does not mutate used_count.
 * @param {{ order: { course_id: number, amount: number, status?: string }, code: string }}
 */
export async function previewCouponForManualPayment({ order, code }) {
  if (String(order?.status ?? 'pending') !== 'pending') {
    throw new ApiError(409, 'This order is not awaiting payment', { code: 'ORDER_NOT_SUBMITTABLE' });
  }

  const normalizedCode = sanitizeCouponCode(code);
  if (!normalizedCode) {
    throw new ApiError(400, COUPON_VALIDATION_MESSAGES.NOT_FOUND, { code: 'COUPON_NOT_FOUND' });
  }

  const coupon = await loadCouponByCode(mysqlPool, normalizedCode);
  assertCouponEligibility(coupon, Number(order.course_id));

  const pricing = computeCouponDiscount(
    Number(order.amount),
    coupon.discount_type,
    Number(coupon.discount_value)
  );

  return {
    valid: true,
    code: String(coupon.code),
    discountApplied: pricing.discountApplied,
    originalAmount: pricing.originalAmount,
    discountedAmount: pricing.discountedAmount,
  };
}

/**
 * Lock, re-check, and increment coupon usage inside an open transaction.
 * @param {{
 *   connection: import('mysql2/promise').PoolConnection,
 *   normalizedCode: string,
 *   courseId: number,
 *   originalAmount: number,
 * }} params
 */
export async function redeemCouponInTransaction({ connection, normalizedCode, courseId, originalAmount }) {
  const [rows] = await connection.query(
    `SELECT id, code, course_id, discount_type, discount_value, usage_limit, used_count,
            valid_from, valid_until, is_active
     FROM coupons
     WHERE code = ?
     FOR UPDATE`,
    [normalizedCode]
  );
  const coupon = rows[0] || null;
  assertCouponEligibility(coupon, courseId);

  const usedCount = Number(coupon.used_count);
  const usageLimit = Number(coupon.usage_limit);
  if (usedCount >= usageLimit) {
    throw new ApiError(422, COUPON_VALIDATION_MESSAGES.USAGE_LIMIT, { code: 'COUPON_USAGE_LIMIT' });
  }

  const pricing = computeCouponDiscount(originalAmount, coupon.discount_type, Number(coupon.discount_value));

  await connection.query(
    `UPDATE coupons SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [Number(coupon.id)]
  );

  return {
    couponId: Number(coupon.id),
    code: String(coupon.code),
    ...pricing,
  };
}

/**
 * Resolve optional coupon_code for manual payment submit.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ couponCode?: string|null, courseId: number, originalAmount: number }} params
 * @returns {Promise<null|ReturnType<typeof redeemCouponInTransaction>>}
 */
export async function redeemCouponForManualPaymentSubmit(connection, { couponCode, courseId, originalAmount }) {
  if (couponCode == null || String(couponCode).trim() === '') {
    return null;
  }

  const normalizedCode = sanitizeCouponCode(couponCode);
  if (!normalizedCode) {
    throw new ApiError(400, COUPON_VALIDATION_MESSAGES.NOT_FOUND, { code: 'COUPON_NOT_FOUND' });
  }

  return redeemCouponInTransaction({
    connection,
    normalizedCode,
    courseId,
    originalAmount,
  });
}

/**
 * Expected payment amount for fraud comparison on a manual_payments row.
 * @param {{ amount_expected?: number|null, original_amount?: number|null, discount_applied?: number|null }} row
 */
export function resolveManualPaymentExpectedAmount(row) {
  if (row.original_amount != null && row.discount_applied != null) {
    return Math.round(Number(row.original_amount) - Number(row.discount_applied));
  }
  return Math.round(Number(row.amount_expected ?? row.original_amount ?? 0));
}

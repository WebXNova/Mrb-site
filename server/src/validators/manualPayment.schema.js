import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';
import {
  PAYMENT_ACCOUNT_METHODS,
  assertValidPaymentAccountNumber,
  normalizePakistaniMobileAccountNumber,
  sanitizeAccountTitle,
} from './paymentAccount.schema.js';
import { sanitizeCouponCode } from './coupon.schema.js';

export const MANUAL_PAYMENT_METHODS = PAYMENT_ACCOUNT_METHODS;

const TRANSACTION_ID_RE = /^[A-Z0-9][A-Z0-9\-_]{5,63}$/;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeTransactionId(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeTransactionId(raw) {
  return normalizeTransactionId(raw).replace(/[\x00-\x1F\x7F]/g, '');
}

export const submitManualPaymentFieldsSchema = z
  .object({
    payment_method: z.enum(MANUAL_PAYMENT_METHODS),
    sender_phone_number: z.string().min(1, 'Sender phone number is required'),
    sender_account_title: z.string().min(1, 'Sender account title is required'),
    transaction_id: z.string().min(1, 'Transaction ID is required'),
    amount_claimed: z.coerce.number().int().positive('Amount claimed must be a positive integer'),
    coupon_code: z.string().nullable().optional(),
  })
  .strict();

export const validateManualPaymentCouponSchema = z
  .object({
    code: z.string().min(1, 'Coupon code is required'),
    order_id: z.coerce.number().int().positive('order_id must be a positive integer'),
  })
  .strict();

/**
 * @param {Record<string, unknown>} body
 * @returns {{
 *   payment_method: 'jazzcash'|'easypaisa',
 *   sender_phone_number: string,
 *   sender_account_title: string,
 *   transaction_id: string,
 *   amount_claimed: number,
 *   coupon_code?: string|null,
 * }}
 */
export function parseSubmitManualPaymentFields(body) {
  const parsed = submitManualPaymentFieldsSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, first?.message || 'Invalid payment submission', {
      code: 'VALIDATION_ERROR',
      issues: parsed.error.flatten(),
    });
  }

  const method = parsed.data.payment_method;
  const senderPhone = normalizePakistaniMobileAccountNumber(parsed.data.sender_phone_number);
  assertValidPaymentAccountNumber(senderPhone, method);

  const title = sanitizeAccountTitle(parsed.data.sender_account_title);
  if (title.length < 2 || title.length > 120) {
    throw new ApiError(400, 'Sender account title must be between 2 and 120 characters', {
      code: 'INVALID_SENDER_TITLE',
      field: 'sender_account_title',
    });
  }

  const transactionId = sanitizeTransactionId(parsed.data.transaction_id);
  if (!TRANSACTION_ID_RE.test(transactionId)) {
    throw new ApiError(400, 'Transaction ID must be 6–64 letters, numbers, hyphens, or underscores', {
      code: 'INVALID_TRANSACTION_ID',
      field: 'transaction_id',
    });
  }

  return {
    payment_method: method,
    sender_phone_number: senderPhone,
    sender_account_title: title,
    transaction_id: transactionId,
    amount_claimed: parsed.data.amount_claimed,
    coupon_code:
      parsed.data.coupon_code == null || String(parsed.data.coupon_code).trim() === ''
        ? null
        : sanitizeCouponCode(parsed.data.coupon_code),
  };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ code: string, order_id: number }}
 */
export function parseValidateManualPaymentCouponBody(body) {
  const parsed = validateManualPaymentCouponSchema.safeParse(body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, first?.message || 'Invalid coupon validation payload', {
      code: 'VALIDATION_ERROR',
      issues: parsed.error.flatten(),
    });
  }

  const code = sanitizeCouponCode(parsed.data.code);
  if (!code) {
    throw new ApiError(400, 'Coupon code is required', {
      code: 'VALIDATION_ERROR',
      field: 'code',
    });
  }

  return {
    code,
    order_id: Number(parsed.data.order_id),
  };
}

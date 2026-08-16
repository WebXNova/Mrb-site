import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';

export const COUPON_DISCOUNT_TYPES = ['flat', 'percentage'];

const CODE_MIN_LENGTH = 3;
const CODE_MAX_LENGTH = 32;
const CODE_PATTERN = /^[A-Z0-9_-]+$/;
const MAX_USAGE_LIMIT = 1_000_000;

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeCouponCode(raw) {
  return String(raw ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function sanitizeOptionalDate(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

const couponCodeInputSchema = z.string().min(1, 'Coupon code is required');

const couponCodeSchema = z
  .string()
  .min(CODE_MIN_LENGTH, `Coupon code must be at least ${CODE_MIN_LENGTH} characters`)
  .max(CODE_MAX_LENGTH, `Coupon code must be at most ${CODE_MAX_LENGTH} characters`)
  .refine((s) => CODE_PATTERN.test(s), {
    message: 'Coupon code may only contain letters, numbers, hyphens, and underscores',
  });

const discountTypeSchema = z.enum(COUPON_DISCOUNT_TYPES);

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const optionalDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .nullable()
  .optional();

export const createCouponSchema = z
  .object({
    code: couponCodeInputSchema,
    course_id: z.number().int().positive('course_id must be a positive integer'),
    discount_type: discountTypeSchema,
    discount_value: z.number().positive('discount_value must be greater than zero'),
    usage_limit: z
      .number()
      .int('usage_limit must be an integer')
      .positive('usage_limit must be at least 1')
      .max(MAX_USAGE_LIMIT, `usage_limit must be at most ${MAX_USAGE_LIMIT}`),
    valid_from: dateStringSchema,
    valid_until: optionalDateStringSchema,
  })
  .strict();

export const updateCouponSchema = createCouponSchema;

/**
 * @param {string} dateStr YYYY-MM-DD
 */
function parseDateOnly(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new ApiError(422, 'Invalid date', { code: 'INVALID_DATE', field: 'valid_from' });
  }
  return dateStr;
}

/**
 * @param {string|null} validFrom
 * @param {string|null} validUntil
 */
function assertValidDateRange(validFrom, validUntil) {
  if (validUntil == null) return;
  if (validUntil < validFrom) {
    throw new ApiError(422, 'valid_until must be on or after valid_from', {
      code: 'INVALID_DATE_RANGE',
      field: 'valid_until',
    });
  }
}

/**
 * @param {'flat'|'percentage'} discountType
 * @param {number} discountValue
 * @param {number|null} coursePriceAmount
 */
export function assertDiscountValueForType(discountType, discountValue, coursePriceAmount) {
  if (discountType === 'percentage') {
    if (discountValue <= 0 || discountValue > 100) {
      throw new ApiError(422, 'Percentage discount must be between 0 and 100 (exclusive of 0)', {
        code: 'INVALID_DISCOUNT_VALUE',
        field: 'discount_value',
      });
    }
    return;
  }

  if (discountType === 'flat') {
    if (coursePriceAmount == null || coursePriceAmount <= 0) {
      throw new ApiError(422, 'Selected course has no effective price for a flat discount', {
        code: 'COURSE_PRICE_UNAVAILABLE',
        field: 'course_id',
      });
    }
    if (discountValue > coursePriceAmount) {
      throw new ApiError(422, 'Flat discount cannot exceed the course price', {
        code: 'INVALID_DISCOUNT_VALUE',
        field: 'discount_value',
        coursePrice: coursePriceAmount,
      });
    }
  }
}

/**
 * @param {unknown} body
 */
export function parseCreateCouponBody(body) {
  const parsed = createCouponSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid coupon payload', parsed.error.flatten());
  }

  const code = sanitizeCouponCode(parsed.data.code);
  const codeCheck = couponCodeSchema.safeParse(code);
  if (!codeCheck.success) {
    throw new ApiError(422, codeCheck.error.errors[0]?.message || 'Invalid coupon code', {
      code: 'INVALID_COUPON_CODE',
      field: 'code',
    });
  }

  const validFrom = parseDateOnly(parsed.data.valid_from);
  const validUntil = sanitizeOptionalDate(parsed.data.valid_until);
  if (validUntil != null) {
    parseDateOnly(validUntil);
  }
  assertValidDateRange(validFrom, validUntil);

  return {
    code,
    course_id: Number(parsed.data.course_id),
    discount_type: parsed.data.discount_type,
    discount_value: Number(parsed.data.discount_value),
    usage_limit: Number(parsed.data.usage_limit),
    valid_from: validFrom,
    valid_until: validUntil,
  };
}

/**
 * @param {unknown} body
 */
export function parseUpdateCouponBody(body) {
  return parseCreateCouponBody(body);
}

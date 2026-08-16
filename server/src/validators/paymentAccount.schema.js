import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';

export const PAYMENT_ACCOUNT_METHODS = Object.freeze(['jazzcash', 'easypaisa']);

const JAZZCASH_PREFIX_RE = /^03(0[0-9]|1[0-9]|2[0-9]|3[0-9]|4[5-9]|70|71)/;

/**
 * Normalize Pakistani mobile wallet input to 11-digit local form (03XXXXXXXXX).
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizePakistaniMobileAccountNumber(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('92') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.startsWith('3') && digits.length === 10) {
    digits = `0${digits}`;
  }

  return digits;
}

/**
 * @param {string} normalized
 * @param {'jazzcash'|'easypaisa'} method
 */
export function assertValidPaymentAccountNumber(normalized, method) {
  if (!/^03[0-9]{9}$/.test(normalized)) {
    throw new ApiError(400, 'Account number must be a valid 11-digit Pakistani mobile number (03XXXXXXXXX).', {
      code: 'INVALID_ACCOUNT_NUMBER',
      field: 'account_number',
    });
  }

  if (method === 'jazzcash' && !JAZZCASH_PREFIX_RE.test(normalized)) {
    throw new ApiError(400, 'This number is not a valid JazzCash mobile prefix.', {
      code: 'INVALID_JAZZCASH_PREFIX',
      field: 'account_number',
    });
  }
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeAccountTitle(raw) {
  return String(raw ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
}

const accountTitleSchema = z
  .string()
  .min(2, 'Account title must be at least 2 characters')
  .max(120, 'Account title must be at most 120 characters')
  .refine((s) => s.trim().length >= 2, 'Account title cannot be empty or whitespace only');

const methodSchema = z.enum(PAYMENT_ACCOUNT_METHODS);

export const createPaymentAccountSchema = z
  .object({
    method: methodSchema,
    account_number: z.string().min(1, 'Account number is required'),
    account_title: z.string().min(1, 'Account title is required'),
  })
  .strict();

export const updatePaymentAccountSchema = z
  .object({
    account_number: z.string().min(1, 'Account number is required'),
    account_title: z.string().min(1, 'Account title is required'),
  })
  .strict();

/**
 * @param {unknown} body
 * @returns {{ method: 'jazzcash'|'easypaisa', account_number: string, account_title: string }}
 */
export function parseCreatePaymentAccountBody(body) {
  const parsed = createPaymentAccountSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid payment account payload', parsed.error.flatten());
  }

  const method = parsed.data.method;
  const account_number = normalizePakistaniMobileAccountNumber(parsed.data.account_number);
  assertValidPaymentAccountNumber(account_number, method);

  const account_title = sanitizeAccountTitle(parsed.data.account_title);
  const titleCheck = accountTitleSchema.safeParse(account_title);
  if (!titleCheck.success) {
    throw new ApiError(422, titleCheck.error.errors[0]?.message || 'Invalid account title', {
      code: 'INVALID_ACCOUNT_TITLE',
      field: 'account_title',
    });
  }

  return { method, account_number, account_title };
}

/**
 * @param {unknown} body
 * @param {'jazzcash'|'easypaisa'} method
 */
export function parseUpdatePaymentAccountBody(body, method) {
  const parsed = updatePaymentAccountSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid payment account payload', parsed.error.flatten());
  }

  const account_number = normalizePakistaniMobileAccountNumber(parsed.data.account_number);
  assertValidPaymentAccountNumber(account_number, method);

  const account_title = sanitizeAccountTitle(parsed.data.account_title);
  const titleCheck = accountTitleSchema.safeParse(account_title);
  if (!titleCheck.success) {
    throw new ApiError(422, titleCheck.error.errors[0]?.message || 'Invalid account title', {
      code: 'INVALID_ACCOUNT_TITLE',
      field: 'account_title',
    });
  }

  return { account_number, account_title };
}

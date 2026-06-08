/**
 * Strict enum guards for tests table fields — no silent coercion.
 */

import { AppError } from '../errors/base/AppError.js';
import {
  INVALID_CATEGORY,
  INVALID_TEST_TYPE,
  VALIDATION_ERROR,
} from '../errors/codes/ErrorCodes.js';
import {
  DEFAULT_TEST_CATEGORY,
  TEST_CATEGORY_VALUES,
  TEST_DB_STATUS_VALUES,
  TEST_TYPE_VALUES,
} from '../constants/testMetadata.constants.js';
import {
  logSecurityEvent,
  TEST_SECURITY_ACTIONS,
} from '../services/testSecurityAudit.service.js';

const TYPE_SET = new Set(TEST_TYPE_VALUES);
const CATEGORY_SET = new Set(TEST_CATEGORY_VALUES);
const STATUS_SET = new Set(TEST_DB_STATUS_VALUES);

/**
 * @param {unknown} value
 * @param {{ field?: string, allowEmpty?: boolean }} [options]
 */
export function parseStrictTestType(value, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (options.allowEmpty) return null;
    throw enumError(INVALID_TEST_TYPE, 'test_type is required', options.field ?? 'test_type', value);
  }
  if (!TYPE_SET.has(raw)) {
    throw enumError(INVALID_TEST_TYPE, `test_type must be one of: ${TEST_TYPE_VALUES.join(', ')}`, 'test_type', value);
  }
  return raw;
}

/**
 * @param {unknown} value
 */
export function parseStrictTestCategory(value) {
  const raw = String(value ?? '').trim();
  const normalized = raw || DEFAULT_TEST_CATEGORY;
  if (!CATEGORY_SET.has(normalized)) {
    throw enumError(INVALID_CATEGORY, `category must be ${TEST_CATEGORY_VALUES.join(' or ')}`, 'category', value);
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @param {{ allowEmpty?: boolean }} [options]
 */
export function parseStrictTestDbStatus(value, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (options.allowEmpty) return null;
    throw enumError(VALIDATION_ERROR, 'status is required', 'status', value);
  }
  if (raw === 'PUBLISHED') return 'published';
  if (raw === 'draft') return 'DRAFT';
  if (!STATUS_SET.has(raw)) {
    throw enumError(
      VALIDATION_ERROR,
      `status must be one of: ${TEST_DB_STATUS_VALUES.join(', ')}`,
      'status',
      value
    );
  }
  return raw;
}

/**
 * @param {string} code
 * @param {string} message
 * @param {string} field
 * @param {unknown} value
 */
function enumError(code, message, field, value) {
  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.UNKNOWN_ENUM_VALUE,
    reason: `UNKNOWN_ENUM_${field}`,
    errorCode: code,
    outcome: 'denied',
    metadata: { field, rejectedValue: value },
  });

  return new AppError({
    message,
    errorCode: code,
    httpStatus: 422,
    isOperational: true,
    metadata: { field, rejectedValue: value },
  });
}

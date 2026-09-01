/**
 * Server-side test_access_type + course_id pairing.
 * Not an authorization service — classification/validation only.
 */

import {
  DEFAULT_TEST_ACCESS_TYPE,
  TEST_ACCESS_TYPE_COURSE_LOCKED,
  TEST_ACCESS_TYPE_VALUES,
} from '../constants/testAccessType.constants.js';
import { AppError } from '../errors/base/AppError.js';
import { VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';

/**
 * @param {unknown} value
 * @returns {typeof TEST_ACCESS_TYPE_VALUES[number]}
 */
export function parseStrictTestAccessType(value) {
  const normalized = String(value ?? DEFAULT_TEST_ACCESS_TYPE).trim().toLowerCase();
  if (!TEST_ACCESS_TYPE_VALUES.includes(normalized)) {
    throw new AppError({
      message: `test_access_type must be one of: ${TEST_ACCESS_TYPE_VALUES.join(', ')}`,
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { test_access_type: value ?? null },
    });
  }
  return normalized;
}

/**
 * @param {unknown} value
 */
export function isStandaloneAccessType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'free_standalone' || normalized === 'paid_standalone';
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeOptionalCourseId(value) {
  if (value == null || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

/**
 * @param {string} accessType
 * @param {unknown} courseIdRaw
 * @returns {{ accessType: string, courseId: number|null }}
 */
export function assertTestAccessTypeCoursePairing(accessType, courseIdRaw) {
  const type = parseStrictTestAccessType(accessType);
  const courseId = normalizeOptionalCourseId(courseIdRaw);

  if (type === TEST_ACCESS_TYPE_COURSE_LOCKED) {
    if (courseId == null) {
      throw new AppError({
        message: 'A course is required for course tests.',
        errorCode: VALIDATION_ERROR,
        httpStatus: 422,
        isOperational: true,
        metadata: { test_access_type: type },
      });
    }
    return { accessType: type, courseId };
  }

  if (courseId != null) {
    throw new AppError({
      message: 'Standalone tests cannot be assigned to a course.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { test_access_type: type },
    });
  }

  return { accessType: type, courseId: null };
}

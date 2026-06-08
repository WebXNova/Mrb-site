import { AppError } from '../base/AppError.js';
import { VALIDATION_ERROR } from '../codes/ErrorCodes.js';
import { COMPLETENESS_ERROR_CODES } from '../../services/testCompleteness.service.js';

export class TestNotCompleteError extends AppError {
  /**
   * @param {string[]} missingFields
   * @param {Record<string, unknown>} [metadata]
   */
  constructor(missingFields = [], metadata = null) {
    super({
      message: 'Test is not complete.',
      errorCode: COMPLETENESS_ERROR_CODES.TEST_NOT_COMPLETE,
      httpStatus: 400,
      isOperational: true,
      metadata: {
        missing_fields: missingFields,
        ...(metadata || {}),
      },
    });
  }
}

export class TestPublishedImmutableError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'Published tests cannot be modified through the test builder.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

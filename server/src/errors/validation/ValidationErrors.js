import { AppError } from '../base/AppError.js';
import { BAD_REQUEST, VALIDATION_ERROR } from '../codes/ErrorCodes.js';

export class ValidationError extends AppError {
  /**
   * @param {string} [message]
   * @param {Record<string, unknown>|null} [metadata] Often field-level errors in metadata.details
   */
  constructor(message = 'Validation failed.', metadata = null) {
    super({ message, errorCode: VALIDATION_ERROR, httpStatus: 422, metadata });
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request.', metadata = null) {
    super({ message, errorCode: BAD_REQUEST, httpStatus: 400, metadata });
  }
}

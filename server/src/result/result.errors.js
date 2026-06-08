import { AppError } from '../errors/base/AppError.js';
import { ACCESS_DENIED, NOT_FOUND } from '../errors/codes/ErrorCodes.js';

export class ResultNotFoundError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Result not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class ResultNotAccessibleError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Results are not available for this test.',
      errorCode: ACCESS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

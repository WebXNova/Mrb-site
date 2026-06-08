import { AppError } from '../errors/base/AppError.js';
import {
  ATTEMPT_INVALID_STATE,
  ATTEMPT_NOT_FOUND,
  INTERNAL_ERROR,
} from '../errors/codes/ErrorCodes.js';

export class GradingAttemptNotFoundError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Attempt was not found for grading.',
      errorCode: ATTEMPT_NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class GradingInvalidStatusError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Attempt must be submitted before grading can run.',
      errorCode: ATTEMPT_INVALID_STATE,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class GradingDataMissingError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Required grading data is missing.',
      errorCode: INTERNAL_ERROR,
      httpStatus: 500,
      isOperational: true,
      metadata,
    });
  }
}

export class GradingPersistenceError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Failed to persist grading result.',
      errorCode: INTERNAL_ERROR,
      httpStatus: 500,
      isOperational: true,
      metadata,
    });
  }
}

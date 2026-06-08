import { AppError } from '../errors/base/AppError.js';
import { ATTEMPT_INVALID_STATE } from '../errors/codes/ErrorCodes.js';

export class AttemptAlreadySubmittedError extends AppError {
  /** @param {Record<string, unknown>|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'This test has already been submitted.',
      errorCode: ATTEMPT_INVALID_STATE,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

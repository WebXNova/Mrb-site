import { AppError } from '../base/AppError.js';
import { REDIS_UNAVAILABLE } from '../codes/ErrorCodes.js';

/** Redis is disconnected, not ready, or a command failed closed. */
export class RedisUnavailableError extends AppError {
  /**
   * @param {{ cause?: Error|null, reason?: string|null }} [options]
   */
  constructor(options = {}) {
    super({
      message: 'Service temporarily unavailable. Please retry shortly.',
      errorCode: REDIS_UNAVAILABLE,
      httpStatus: 503,
      isOperational: true,
      metadata: {
        retryable: true,
        reason: options.reason ?? null,
      },
      cause: options.cause ?? null,
    });
  }
}

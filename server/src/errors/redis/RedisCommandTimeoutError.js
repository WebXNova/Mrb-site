import { AppError } from '../base/AppError.js';
import { REDIS_COMMAND_TIMEOUT } from '../codes/ErrorCodes.js';

/** Redis command exceeded REDIS_COMMAND_TIMEOUT_MS. */
export class RedisCommandTimeoutError extends AppError {
  /**
   * @param {{ timeoutMs?: number, command?: string|null, cause?: Error|null }} [options]
   */
  constructor(options = {}) {
    super({
      message: 'Session service timed out. Please retry shortly.',
      errorCode: REDIS_COMMAND_TIMEOUT,
      httpStatus: 503,
      isOperational: true,
      metadata: {
        retryable: true,
        timeoutMs: options.timeoutMs ?? null,
        command: options.command ?? null,
      },
      cause: options.cause ?? null,
    });
  }
}

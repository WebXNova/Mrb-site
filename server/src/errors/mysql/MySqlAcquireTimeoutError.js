import { AppError } from '../base/AppError.js';
import { MYSQL_POOL_ACQUIRE_TIMEOUT } from '../codes/ErrorCodes.js';

/** Pool queue wait exceeded MYSQL_POOL_ACQUIRE_TIMEOUT_MS. */
export class MySqlAcquireTimeoutError extends AppError {
  /**
   * @param {{ timeoutMs?: number, cause?: Error|null }} [options]
   */
  constructor(options = {}) {
    super({
      message: 'Database connection wait timed out. Please retry shortly.',
      errorCode: MYSQL_POOL_ACQUIRE_TIMEOUT,
      httpStatus: 503,
      isOperational: true,
      metadata: {
        retryable: true,
        timeoutMs: options.timeoutMs ?? null,
      },
      cause: options.cause ?? null,
    });
  }
}

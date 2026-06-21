import { AppError } from '../base/AppError.js';
import { MYSQL_POOL_EXHAUSTED } from '../codes/ErrorCodes.js';

/**
 * Raised when the MySQL pool connection queue is full (queueLimit reached).
 * Maps to HTTP 503 — clients should retry with backoff.
 */
export class MySqlPoolExhaustedError extends AppError {
  /**
   * @param {{ cause?: Error|null }} [options]
   */
  constructor(options = {}) {
    super({
      message: 'Database is temporarily busy. Please retry shortly.',
      errorCode: MYSQL_POOL_EXHAUSTED,
      httpStatus: 503,
      isOperational: true,
      metadata: { retryable: true },
      cause: options.cause ?? null,
    });
  }
}

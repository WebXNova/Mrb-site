import { AppError } from '../base/AppError.js';
import { MYSQL_TRANSACTION_TIMEOUT } from '../codes/ErrorCodes.js';

/** Open transaction exceeded MYSQL_TRANSACTION_TIMEOUT_MS wall clock. */
export class MySqlTransactionTimeoutError extends AppError {
  /**
   * @param {{ timeoutMs?: number, cause?: Error|null }} [options]
   */
  constructor(options = {}) {
    super({
      message: 'Database transaction timed out. Please retry shortly.',
      errorCode: MYSQL_TRANSACTION_TIMEOUT,
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

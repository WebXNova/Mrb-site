import { AppError } from '../base/AppError.js';
import { MYSQL_QUERY_TIMEOUT } from '../codes/ErrorCodes.js';

/** Statement exceeded MYSQL_QUERY_TIMEOUT_MS (mysql2 inactivity timeout). */
export class MySqlQueryTimeoutError extends AppError {
  /**
   * @param {{ timeoutMs?: number, cause?: Error|null }} [options]
   */
  constructor(options = {}) {
    super({
      message: 'Database query timed out. Please retry shortly.',
      errorCode: MYSQL_QUERY_TIMEOUT,
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

import { AppError } from '../base/AppError.js';
import { EXTERNAL_REQUEST_TIMEOUT } from '../codes/ErrorCodes.js';

/** Outbound HTTP/SDK call exceeded its deadline. */
export class ExternalRequestTimeoutError extends AppError {
  /**
   * @param {{ timeoutMs?: number, dependency?: string|null, cause?: Error|null, httpStatus?: number, message?: string }} [options]
   */
  constructor(options = {}) {
    super({
      message: options.message || 'An upstream service timed out. Please retry shortly.',
      errorCode: EXTERNAL_REQUEST_TIMEOUT,
      httpStatus: options.httpStatus ?? 503,
      isOperational: true,
      metadata: {
        retryable: true,
        timeoutMs: options.timeoutMs ?? null,
        dependency: options.dependency ?? null,
      },
      cause: options.cause ?? null,
    });
  }
}

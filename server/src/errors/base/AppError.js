/**
 * Base application error for all operational and security failures.
 *
 * Design goals:
 * - Explicit, serializable contract for clients and observability
 * - Safe defaults (no internal leakage via toJSON)
 * - Rich internal context via metadata for structured logging
 */

export class AppError extends Error {
  /**
   * @param {object} options
   * @param {string} options.message Client-safe message (may be overridden in production for 5xx)
   * @param {string} options.errorCode Stable machine-readable code (see errors/codes/ErrorCodes.js)
   * @param {number} [options.httpStatus=500] HTTP status to return
   * @param {boolean} [options.isOperational=true] Expected/handled failure vs programmer bug
   * @param {Record<string, unknown>|null} [options.metadata] Internal context — never sent to clients by default
   * @param {Error|null} [options.cause] Original error for logging chains
   */
  constructor({
    message,
    errorCode,
    httpStatus = 500,
    isOperational = true,
    metadata = null,
    cause = null,
  }) {
    if (!message || typeof message !== 'string') {
      throw new TypeError('AppError requires a non-empty message string');
    }
    if (!errorCode || typeof errorCode !== 'string') {
      throw new TypeError('AppError requires a non-empty errorCode string');
    }

    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
    this.isOperational = isOperational;
    this.metadata = metadata && typeof metadata === 'object' ? { ...metadata } : null;

    Error.captureStackTrace(this, this.constructor);
  }

  /** @returns {boolean} */
  isClientError() {
    return this.httpStatus >= 400 && this.httpStatus < 500;
  }

  /** @returns {boolean} */
  isServerError() {
    return this.httpStatus >= 500;
  }

  /**
   * Client-safe JSON fragment (no stack, no metadata by default).
   * @param {{ includeMetadata?: boolean }} [opts]
   */
  toJSON(opts = {}) {
    const { includeMetadata = false } = opts;
    const body = {
      code: this.errorCode,
      message: this.message,
    };
    if (includeMetadata && this.metadata) {
      body.metadata = this.sanitizeMetadataForClient(this.metadata);
    }
    return body;
  }

  /**
   * Full structured payload for logging / APM (never send raw to clients in production).
   * @param {{ requestId?: string|null }} [ctx]
   */
  toLogPayload(ctx = {}) {
    return {
      errorName: this.name,
      errorCode: this.errorCode,
      httpStatus: this.httpStatus,
      isOperational: this.isOperational,
      message: this.message,
      metadata: this.metadata,
      requestId: ctx.requestId ?? null,
      stack: this.stack,
      cause:
        this.cause instanceof Error
          ? { name: this.cause.name, message: this.cause.message, stack: this.cause.stack }
          : null,
    };
  }

  /**
   * Strip sensitive keys before any optional client metadata exposure (dev only).
   * @param {Record<string, unknown>} metadata
   */
  sanitizeMetadataForClient(metadata) {
    const blocked = new Set([
      'stack',
      'sql',
      'query',
      'password',
      'token',
      'secret',
      'rawBody',
      'internal',
    ]);
    const out = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (blocked.has(key.toLowerCase())) continue;
      if (typeof value === 'string' && value.length > 500) {
        out[key] = `${value.slice(0, 497)}...`;
        continue;
      }
      out[key] = value;
    }
    return out;
  }
}

/**
 * Central export for the LMS error architecture.
 */

export { AppError } from './base/index.js';
export * as ErrorCodes from './codes/index.js';
export * from './codes/ErrorCodes.js';

export * from './entitlement/index.js';
export * from './auth/index.js';
export * from './payment/index.js';
export * from './media/index.js';
export * from './validation/index.js';
export * from './cee/index.js';

export { buildErrorResponse, sendAppErrorResponse } from './format/index.js';
export { errorHandler, notFoundHandler, normalizeError, isAppError } from './middleware/index.js';

/**
 * Re-exports centralized error middleware for existing app.js imports.
 * Implementation lives in server/src/errors/middleware/.
 */
export { errorHandler, notFoundHandler } from '../errors/middleware/errorHandler.js';

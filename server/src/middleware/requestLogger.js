import { createRequestId } from '../utils/requestId.js';

/**
 * Middleware to attach a unique request ID to each request
 * Adds req.requestId and res.locals.requestId for logging
 */
export function requestIdMiddleware(req, res, next) {
  const requestId = createRequestId();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  
  // Add to response header for debugging
  res.setHeader('X-Request-Id', requestId);
  
  next();
}

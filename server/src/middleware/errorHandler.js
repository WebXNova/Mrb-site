import { ApiError } from '../utils/apiError.js';
import { sanitizePath } from '../utils/logSanitizer.js';

export function notFoundHandler(req, res) {
  const safePath = sanitizePath(req.originalUrl);
  res.status(404).json({
    success: false,
    requestId: req.requestId || null,
    message: `Route not found: ${req.method} ${safePath}`,
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const isProd = process.env.NODE_ENV === 'production';
  const status = err instanceof ApiError ? err.statusCode : 500;
  if (status >= 500) {
    console.error('Unhandled request error:', {
      requestId: req.requestId || null,
      method: req.method,
      path: sanitizePath(req.originalUrl),
      status,
      message: err.message,
      stack: err.stack,
    });
  }

  if (err instanceof ApiError) {
    const safeMessage = isProd && err.statusCode >= 500 ? 'Internal server error' : err.message;
    return res.status(err.statusCode).json({
      success: false,
      requestId: req.requestId || null,
      message: safeMessage,
      ...(isProd ? {} : { details: err.details }),
    });
  }

  return res.status(500).json({
    success: false,
    requestId: req.requestId || null,
    message: 'Internal server error',
    ...(isProd ? {} : { debug: err.message }),
  });
}

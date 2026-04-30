import { ApiError } from '../utils/apiError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const isProd = process.env.NODE_ENV === 'production';
  const status = err instanceof ApiError ? err.statusCode : 500;
  if (status >= 500) {
    console.error('Unhandled request error:', {
      method: req.method,
      path: req.originalUrl,
      status,
      message: err.message,
      stack: err.stack,
    });
  }

  if (err instanceof ApiError) {
    const safeMessage = isProd && err.statusCode >= 500 ? 'Internal server error' : err.message;
    return res.status(err.statusCode).json({
      success: false,
      message: safeMessage,
      ...(isProd ? {} : { details: err.details }),
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(isProd ? {} : { debug: err.message }),
  });
}

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

  const enrollmentsTableMissing =
    err?.code === 'ER_NO_SUCH_TABLE' &&
    typeof err.sqlMessage === 'string' &&
    /\benrollments\b/i.test(err.sqlMessage);

  const mysqlAccessDenied =
    err?.code === 'ER_ACCESS_DENIED_ERROR' ||
    err?.errno === 1045 ||
    err?.errno === 1049;

  return res.status(500).json({
    success: false,
    requestId: req.requestId || null,
    message: mysqlAccessDenied
      ? err?.errno === 1049
        ? 'Unknown MySQL database — create MYSQL_DATABASE in MySQL or fix the name in server/.env.'
        : 'Database rejected the connection — check MYSQL_USER / MYSQL_PASSWORD in server/.env (use quotes around passwords with @ or ?) and GRANT privileges. See server/scripts/grant-mrb-app.sql.'
      : enrollmentsTableMissing
        ? 'Enrollment registration is unavailable until the database is updated (missing enrollments table). Contact the administrator.'
        : 'Internal server error',
    ...(isProd ? {} : { debug: err.message }),
  });
}

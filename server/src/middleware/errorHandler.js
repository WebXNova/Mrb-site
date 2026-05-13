import { ApiError } from '../utils/apiError.js';
import { sendError } from '../utils/httpEnvelope.js';
import { sanitizePath } from '../utils/logSanitizer.js';

function resolveApiErrorCode(err) {
  if (err.code) return err.code;
  if (err.statusCode === 422 && err.details) return 'VALIDATION_ERROR';
  const byStatus = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    410: 'GONE',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    503: 'SERVICE_UNAVAILABLE',
  };
  return byStatus[err.statusCode] || 'INTERNAL_ERROR';
}

export function notFoundHandler(req, res) {
  const safePath = sanitizePath(req.originalUrl);
  return sendError(res, 404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${safePath}`, {
    requestId: req.requestId || null,
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
    const code = resolveApiErrorCode(err);
    return sendError(res, err.statusCode, code, safeMessage, {
      requestId: req.requestId || null,
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

  const message = mysqlAccessDenied
    ? err?.errno === 1049
      ? 'Unknown MySQL database — create MYSQL_DATABASE in MySQL or fix the name in server/.env.'
      : 'Database rejected the connection — check MYSQL_USER / MYSQL_PASSWORD in server/.env (use quotes around passwords with @ or ?) and GRANT privileges. See server/scripts/grant-mrb-app.sql.'
    : enrollmentsTableMissing
      ? 'Enrollment registration is unavailable until the database is updated (missing enrollments table). Contact the administrator.'
      : 'Internal server error';

  const code = mysqlAccessDenied
    ? err?.errno === 1049
      ? 'MYSQL_UNKNOWN_DATABASE'
      : 'MYSQL_ACCESS_DENIED'
    : enrollmentsTableMissing
      ? 'MYSQL_SCHEMA_INCOMPLETE'
      : 'INTERNAL_ERROR';

  return sendError(res, 500, code, message, {
    requestId: req.requestId || null,
    ...(isProd ? {} : { debug: err.message }),
  });
}

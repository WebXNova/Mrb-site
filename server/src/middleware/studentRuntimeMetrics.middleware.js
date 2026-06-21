/**
 * HTTP-level student runtime metrics + audit (slug, portal, legacy paths).
 */

import {
  recordStudentRuntimeFailure,
  recordStudentRuntimeSuccess,
} from '../observability/studentRuntimeMetrics.service.js';
import {
  emitStudentRuntimeAudit,
  STUDENT_RUNTIME_AUDIT_EVENTS,
} from '../observability/studentRuntimeObservability.service.js';
import { resolveStudentRuntimeOperation } from '../observability/studentRuntimeOperationResolver.js';

const RUNTIME_PATH = /^\/api\/(tests|student|attempt|attempts)(\/|$)/i;

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function studentRuntimeMetricsMiddleware(req, res, next) {
  const path = String(req.path || '');
  if (!RUNTIME_PATH.test(path)) {
    next();
    return;
  }

  const startedAt = Date.now();
  const { stack, operation } = resolveStudentRuntimeOperation(req);

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    const status = Number(res.statusCode ?? 0);
    const success = status >= 200 && status < 400;
    const errorCode = success ? null : String(res.locals?.runtimeErrorCode ?? status);

    const base = {
      stack,
      operation,
      durationMs,
      requestId: req.requestId ?? null,
      userId: req.user?.id ?? null,
      courseId: req.cee?.courseId ?? req.entitlement?.courseId ?? null,
      attemptId: req.params?.attemptId != null ? Number(req.params.attemptId) || null : null,
      slug: req.params?.slug != null ? String(req.params.slug).trim() || null : null,
    };

    if (success) {
      recordStudentRuntimeSuccess({ stack, operation, durationMs });
      emitStudentRuntimeAudit({
        event: STUDENT_RUNTIME_AUDIT_EVENTS.OPERATION_SUCCESS,
        ...base,
        outcome: 'success',
      });
    } else {
      recordStudentRuntimeFailure({ stack, operation, durationMs, errorCode });
      emitStudentRuntimeAudit({
        event: STUDENT_RUNTIME_AUDIT_EVENTS.OPERATION_FAILURE,
        ...base,
        outcome: 'failure',
        errorCode,
      });
    }
  });

  next();
}

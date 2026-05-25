import { logActivity } from '../../services/activityLog.service.js';
import { getClientIp } from '../../utils/network.js';
import { sanitizePath } from '../../utils/logSanitizer.js';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Phase 1B: mutation-only audit passthrough — never blocks, never throws to caller.
 * Uses existing activity_logs via logActivity (already non-blocking internally).
 *
 * @type {import('express').RequestHandler}
 */
export function adminAuditLogger(req, res, next) {
  try {
    const method = String(req.method || '').toUpperCase();
    if (MUTATION_METHODS.has(method)) {
      try {
        const adminId = req.user?.id;
        void logActivity({
          userId: adminId ?? null,
          role: typeof req.user?.role === 'string' ? req.user.role : 'admin',
          action: 'admin.security.mutation_audit',
          entityType: 'admin_http',
          entityId: null,
          metadata: {
            route: sanitizePath(req.originalUrl),
            method,
            ip: getClientIp(req),
            timestamp: new Date().toISOString(),
          },
        });
      } catch {
        /* swallow — must not affect traffic */
      }
    }
  } catch {
    /* swallow — outer belt-and-suspenders */
  }
  return next();
}

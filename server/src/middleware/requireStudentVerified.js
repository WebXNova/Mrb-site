import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { sanitizePath } from '../utils/logSanitizer.js';

export async function requireStudentVerified(req, res, next) {
  try {
    if (!req.user?.id) {
      return next(new ApiError(401, 'Authentication required'));
    }
    const [rows] = await mysqlPool.query(`SELECT is_verified FROM users WHERE id = ? AND role = 'student' LIMIT 1`, [req.user.id]);
    if (!rows[0]) {
      return next(new ApiError(401, 'Student account not found'));
    }
    if (!rows[0].is_verified) {
      await logActivity({
        userId: req.user.id,
        role: 'student',
        action: 'auth.unverified_blocked',
        entityType: 'auth',
        metadata: { path: sanitizePath(req.originalUrl) },
      });
      return next(new ApiError(403, 'Please verify your email before accessing student resources'));
    }
    return next();
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      return next(new ApiError(503, 'Email verification is not available yet. Run latest schema migration.'));
    }
    return next(error);
  }
}


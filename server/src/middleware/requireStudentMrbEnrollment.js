import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

/**
 * Blocks student API access until an admin-generated MRB enrollment code has been redeemed.
 */
export async function requireStudentMrbEnrollment(req, res, next) {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT mrb_enrollment_verified_at FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    const verifiedAt = rows[0]?.mrb_enrollment_verified_at;
    if (verifiedAt) {
      next();
      return;
    }
    next(
      new ApiError(403, 'Enter your MRB enrollment code to open the student portal.', {
        code: 'MRB_ENROLLMENT_REQUIRED',
      }),
    );
  } catch (error) {
    if (error?.code === 'ER_BAD_FIELD_ERROR') {
      next(new ApiError(503, 'MRB enrollment verification is not available yet. Run latest schema migration.'));
      return;
    }
    next(error);
  }
}

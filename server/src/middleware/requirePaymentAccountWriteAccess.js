import { ApiError } from '../utils/apiError.js';
import { canWritePaymentAccounts } from '../utils/paymentAccountAccess.js';

/**
 * Financial settings writes — super_admin only (DB role, not JWT snapshot).
 * Regular admin role retains read-only access on GET routes.
 *
 * @type {import('express').RequestHandler}
 */
export async function requirePaymentAccountWriteAccess(req, _res, next) {
  try {
    const userId = Number(req.user?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const allowed = await canWritePaymentAccounts(userId);
    if (!allowed) {
      return next(
        new ApiError(403, 'Super admin access required for payment account changes', {
          code: 'PAYMENT_ACCOUNT_WRITE_FORBIDDEN',
        })
      );
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

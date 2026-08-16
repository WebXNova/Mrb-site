import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { loadOwnedPendingOrder } from '../services/manualPayments.service.js';

/**
 * Verify the authenticated student owns the order before rate limiting or mutation.
 * Prevents cross-student orderId spam from consuming another order's rate-limit bucket.
 *
 * @type {import('express').RequestHandler}
 */
export const requireOwnedManualPaymentOrder = asyncHandler(async (req, _res, next) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const orderId = Number(req.params?.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new ApiError(400, 'Invalid order id');
  }

  await loadOwnedPendingOrder(orderId, studentId);
  next();
});

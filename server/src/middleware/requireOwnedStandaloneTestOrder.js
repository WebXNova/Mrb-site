import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { loadOwnedStandaloneOrder } from '../services/paidStandalonePayment.service.js';

export const requireOwnedStandaloneTestOrder = asyncHandler(async (req, _res, next) => {
  const studentId = Number(req.user?.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  const orderId = Number(req.params?.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new ApiError(400, 'Invalid order id');
  }
  await loadOwnedStandaloneOrder(orderId, studentId);
  next();
});

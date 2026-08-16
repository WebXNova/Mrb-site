import { isAdminRole } from './isAdminRole.js';
import { ApiError } from './apiError.js';

/**
 * Manual payment review — regular admin and super_admin (not teachers/students).
 * Unlike payment-account writes, this is a high-volume operational task.
 *
 * @param {unknown} role
 */
export function assertManualPaymentReviewerRole(role) {
  if (!isAdminRole(role)) {
    throw new ApiError(403, 'Admin access required to review payment submissions', {
      code: 'MANUAL_PAYMENT_REVIEW_FORBIDDEN',
    });
  }
}

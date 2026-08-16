import { Router } from 'express';
import { authMiddleware, rejectStudentBearerInProduction } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { manualPaymentSubmitRateLimit } from '../middleware/manualPaymentSubmitRateLimit.js';
import { manualPaymentCouponValidateRateLimit } from '../middleware/manualPaymentCouponValidateRateLimit.js';
import { requireOwnedManualPaymentOrder } from '../middleware/requireOwnedManualPaymentOrder.js';
import {
  getManualCheckoutInfoHandler,
  getManualPaymentScreenshotHandler,
  getManualPaymentStatusHandler,
  postManualPaymentSubmit,
  postValidateManualPaymentCouponHandler,
} from '../controllers/manualPayments.controller.js';

const router = Router();

router.get(
  '/checkout-info',
  rejectStudentBearerInProduction,
  authMiddleware,
  getManualCheckoutInfoHandler
);

router.post(
  '/validate-coupon',
  rejectStudentBearerInProduction,
  authMiddleware,
  requireCsrf,
  manualPaymentCouponValidateRateLimit,
  postValidateManualPaymentCouponHandler
);

router.get(
  '/:orderId/screenshot',
  rejectStudentBearerInProduction,
  authMiddleware,
  getManualPaymentScreenshotHandler
);

router.get(
  '/:orderId/status',
  rejectStudentBearerInProduction,
  authMiddleware,
  getManualPaymentStatusHandler
);

router.post(
  '/:orderId/submit',
  rejectStudentBearerInProduction,
  authMiddleware,
  requireCsrf,
  requireOwnedManualPaymentOrder,
  manualPaymentSubmitRateLimit,
  ...postManualPaymentSubmit
);

export default router;

import { Router } from 'express';
import {
  getManualPaymentSubmission,
  getManualPaymentSubmissionScreenshot,
  getManualPaymentSubmissions,
  putApproveManualPaymentSubmission,
  putRejectManualPaymentSubmission,
} from '../controllers/manualPaymentReview.controller.js';

const router = Router();

router.get('/', getManualPaymentSubmissions);
router.get('/:id/screenshot', getManualPaymentSubmissionScreenshot);
router.get('/:id', getManualPaymentSubmission);
router.put('/:id/approve', putApproveManualPaymentSubmission);
router.put('/:id/reject', putRejectManualPaymentSubmission);

export default router;

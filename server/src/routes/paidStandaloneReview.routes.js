import { Router } from 'express';
import {
  getPaidStandaloneSubmission,
  getPaidStandaloneSubmissionScreenshot,
  getPaidStandaloneSubmissions,
  putApprovePaidStandaloneSubmission,
  putRejectPaidStandaloneSubmission,
} from '../controllers/paidStandaloneReview.controller.js';

const router = Router();

router.get('/', getPaidStandaloneSubmissions);
router.get('/:id/screenshot', getPaidStandaloneSubmissionScreenshot);
router.get('/:id', getPaidStandaloneSubmission);
router.put('/:id/approve', putApprovePaidStandaloneSubmission);
router.put('/:id/reject', putRejectPaidStandaloneSubmission);

export default router;

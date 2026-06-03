import { Router } from 'express';
import {
  getStartTest,
  getTestResult,
  patchSaveAnswer,
  postSubmitAttempt,
  postVerifyTestCode,
} from '../controllers/publicTests.controller.js';

/**
 * CEE protection grid applies identity + entitlement to all /api/tests/* routes automatically.
 */
const router = Router();

router.post('/:slug/verify-code', postVerifyTestCode);
router.get('/:slug/attempts/:attemptId/start', getStartTest);
router.patch('/:slug/attempts/:attemptId/answers', patchSaveAnswer);
router.post('/:slug/attempts/:attemptId/submit', postSubmitAttempt);
router.get('/:slug/attempts/:attemptId/result', getTestResult);

export default router;

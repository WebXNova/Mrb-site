import { Router } from 'express';
import { requireCsrf } from '../middleware/csrf.js';
import { manualPaymentSubmitRateLimit } from '../middleware/manualPaymentSubmitRateLimit.js';
import {
  autosaveRateLimit,
  requireRedisForAutosave,
} from '../middleware/autosaveRateLimit.js';
import {
  requireRedisForTestSubmit,
  testSubmitRateLimit,
} from '../middleware/testSubmitRateLimit.js';
import { requireOwnedStandaloneTestOrder } from '../middleware/requireOwnedStandaloneTestOrder.js';
import {
  getFreeStandaloneCatalog,
  getStandaloneMyTests,
  getStandaloneMyResults,
  getPaidStandaloneCatalog,
  getPaidStandaloneCheckout,
  getPaidStandaloneMyRegistration,
  getPaidStandalonePrep,
  getPaidStandalonePublic,
  getPaidStandaloneResult,
  getPaidStandaloneStart,
  getPaidStandaloneStatus,
  getPaidStandaloneStudentScreenshot,
  patchPaidStandaloneAnswer,
  paidStandaloneScreenshotUpload,
  postPaidStandaloneIntegrityEvent,
  postPaidStandalonePaymentSubmit,
  postPaidStandaloneRegister,
  postPaidStandaloneSubmit,
  postPaidStandaloneVerify,
} from '../controllers/paidStandalone.controller.js';
import {
  getFreeSessionAttemptStart,
  getFreeSessionStatusHandler,
  patchFreeSessionAttemptAnswer,
  postFreeSessionAttemptSubmit,
  postFreeSessionClaim,
  postFreeSessionEnrollment,
  postFreeSessionIntegrityEvent,
  postFreeSessionStart,
} from '../controllers/freeSession.controller.js';

const router = Router();

router.get('/catalog', getPaidStandaloneCatalog);
router.get('/free-catalog', getFreeStandaloneCatalog);
router.get('/my-results', getStandaloneMyResults);
router.get('/my-tests', getStandaloneMyTests);
router.get('/public/:slug', getPaidStandalonePublic);

router.get('/:slug/free-session', getFreeSessionStatusHandler);
router.post(
  '/:slug/free-session/start',
  requireCsrf,
  requireRedisForTestSubmit,
  testSubmitRateLimit,
  postFreeSessionStart
);
router.post('/:slug/free-session/enrollment', requireCsrf, postFreeSessionEnrollment);
router.post('/:slug/free-session/claim', requireCsrf, postFreeSessionClaim);
router.get('/:slug/free-session/attempts/:attemptId/start', autosaveRateLimit, getFreeSessionAttemptStart);
router.patch(
  '/:slug/free-session/attempts/:attemptId/answers',
  requireCsrf,
  requireRedisForAutosave,
  autosaveRateLimit,
  patchFreeSessionAttemptAnswer
);
router.post(
  '/:slug/free-session/attempts/:attemptId/submit',
  requireCsrf,
  requireRedisForTestSubmit,
  testSubmitRateLimit,
  postFreeSessionAttemptSubmit
);
router.post(
  '/:slug/free-session/attempts/:attemptId/integrity-events',
  requireCsrf,
  requireRedisForAutosave,
  autosaveRateLimit,
  postFreeSessionIntegrityEvent
);

router.post('/:slug/register', requireCsrf, postPaidStandaloneRegister);
router.get('/orders/:orderId/checkout-info', getPaidStandaloneCheckout);
router.get('/orders/:orderId/status', getPaidStandaloneStatus);
router.get('/orders/:orderId/screenshot', getPaidStandaloneStudentScreenshot);
router.post(
  '/orders/:orderId/submit',
  requireCsrf,
  requireOwnedStandaloneTestOrder,
  manualPaymentSubmitRateLimit,
  paidStandaloneScreenshotUpload,
  postPaidStandalonePaymentSubmit
);

router.get('/:slug/my-registration', getPaidStandaloneMyRegistration);
router.get('/:slug/prep', getPaidStandalonePrep);
router.post(
  '/:slug/verify-code',
  requireCsrf,
  requireRedisForTestSubmit,
  testSubmitRateLimit,
  postPaidStandaloneVerify
);
router.get('/:slug/attempts/:attemptId/start', autosaveRateLimit, getPaidStandaloneStart);
router.patch(
  '/:slug/attempts/:attemptId/answers',
  requireCsrf,
  requireRedisForAutosave,
  autosaveRateLimit,
  patchPaidStandaloneAnswer
);
router.post(
  '/:slug/attempts/:attemptId/submit',
  requireCsrf,
  requireRedisForTestSubmit,
  testSubmitRateLimit,
  postPaidStandaloneSubmit
);
router.get('/:slug/attempts/:attemptId/result', autosaveRateLimit, getPaidStandaloneResult);
router.post(
  '/:slug/attempts/:attemptId/integrity-events',
  requireCsrf,
  requireRedisForAutosave,
  autosaveRateLimit,
  postPaidStandaloneIntegrityEvent
);

export default router;

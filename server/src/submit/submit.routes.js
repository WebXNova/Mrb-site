import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { attemptGuard } from '../attempt/attempt.middleware.js';
import {
  requireRedisForTestSubmit,
  testSubmitRateLimit,
} from '../middleware/testSubmitRateLimit.js';
import { submitTest } from './submit.controller.js';

const router = Router();

router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));

router.post(
  '/:attempt_id/submit',
  requireRedisForTestSubmit,
  testSubmitRateLimit,
  attemptGuard,
  submitTest
);

export default router;

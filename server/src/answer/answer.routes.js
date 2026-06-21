import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { attemptGuard } from '../attempt/attempt.middleware.js';
import {
  autosaveRateLimit,
  requireRedisForAutosave,
} from '../middleware/autosaveRateLimit.js';
import { saveAnswer } from './answer.controller.js';

const router = Router();

router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));

router.post(
  '/:attempt_id/answers',
  requireRedisForAutosave,
  autosaveRateLimit,
  attemptGuard,
  saveAnswer
);

export default router;

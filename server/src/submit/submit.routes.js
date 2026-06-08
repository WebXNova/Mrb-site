import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { attemptGuard } from '../attempt/attempt.middleware.js';
import { submitTest } from './submit.controller.js';

const router = Router();

router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));

router.post('/:attempt_id/submit', attemptGuard, submitTest);

export default router;

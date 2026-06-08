import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { attemptGuard } from '../attempt/attempt.middleware.js';
import { saveAnswer } from './answer.controller.js';

const router = Router();

router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));

router.post('/:attempt_id/answers', attemptGuard, saveAnswer);

export default router;

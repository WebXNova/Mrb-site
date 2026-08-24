/**
 * @deprecated G-RT-02 — not mounted unless LEGACY_RUNTIME_ALLOW=true.
 * Canonical: GET /api/tests/:slug/attempts/:attemptId/start
 */
import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { getActiveAttemptForTest, getAttempt } from './attempt.controller.js';
import { attemptGuard } from './attempt.middleware.js';

const router = Router();

router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));

router.get('/tests/:testId/active', getActiveAttemptForTest);
router.get('/:attemptId', attemptGuard, getAttempt);

export default router;

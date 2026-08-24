/**
 * @deprecated G-RT-02 — not mounted unless LEGACY_RUNTIME_ALLOW=true.
 * Canonical result: GET /api/student/results/:attemptId or GET /api/tests/:slug/attempts/:attemptId/result
 */
import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { getResult } from './result.controller.js';

const router = Router();

router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));

router.get('/:attempt_id/result', getResult);

export default router;

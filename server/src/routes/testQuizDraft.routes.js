import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import {
  deleteTestQuizDraftHandler,
  getTestQuizDraftHandler,
  putTestQuizDraftHandler,
} from '../controllers/testQuizDraft.controller.js';
import { requireUnpublishedTest } from '../middleware/requireUnpublishedTest.js';
import { testQuizDraftRateLimit } from '../middleware/testQuizDraftRateLimit.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';

/**
 * Quiz Builder draft APIs — mounted at /api/tests (before public slug routes).
 *
 * GET    /api/tests/:testId/quiz-draft
 * PUT    /api/tests/:testId/quiz-draft
 * DELETE /api/tests/:testId/quiz-draft
 *
 * Admin middleware is scoped to quiz-draft routes only so student slug runtime
 * (GET /api/tests/:slug/prep, verify-code, etc.) is not blocked.
 */
const router = Router();

const adminQuizDraftStack = [
  ...adminSecurityStack,
  enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }),
];

router.get('/:testId/quiz-draft', ...adminQuizDraftStack, getTestQuizDraftHandler);
router.put(
  '/:testId/quiz-draft',
  ...adminQuizDraftStack,
  testQuizDraftRateLimit,
  putTestQuizDraftHandler
);
router.delete(
  '/:testId/quiz-draft',
  ...adminQuizDraftStack,
  testQuizDraftRateLimit,
  requireUnpublishedTest,
  deleteTestQuizDraftHandler
);

export default router;

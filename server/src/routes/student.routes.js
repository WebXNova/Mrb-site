import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { getStudentTestHistoryHandler } from '../controllers/studentTestHistory.controller.js';
import { getStudentDashboardData, getStudentResultDetail } from '../controllers/student.controller.js';
import { getStudentTests, postStudentTestStart } from '../controllers/studentTests.controller.js';
import {
  getStudentAttempt,
  postStudentAttemptAnswer,
} from '../controllers/studentAttempts.controller.js';
import {
  getStudentQuestionById,
  getStudentQuestions,
  postStudentQuestion,
} from '../controllers/studentQuestions.controller.js';
import { postStudentQuestionAttachment } from '../controllers/studentQuestionUpload.controller.js';

const router = Router();
router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));
router.get('/dashboard', getStudentDashboardData);
router.get('/test-history', getStudentTestHistoryHandler);
router.get('/tests', getStudentTests);
router.post('/tests/:testId/start', postStudentTestStart);
router.get('/attempts/:attemptId', getStudentAttempt);
router.post('/attempts/:attemptId/answer', postStudentAttemptAnswer);
router.get('/questions', getStudentQuestions);
router.post('/questions/attachment', postStudentQuestionAttachment);
router.post('/questions', postStudentQuestion);
router.get('/questions/:id', getStudentQuestionById);
router.get('/results/:attemptId', getStudentResultDetail);

export default router;

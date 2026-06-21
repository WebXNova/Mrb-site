import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { rejectStudentBearerInProduction } from '../middleware/auth.js';
import { getStudentTestHistoryHandler } from '../controllers/studentTestHistory.controller.js';
import {
  getStudentDashboardData,
  getStudentEnrollmentStatus,
  getStudentMyCourseData,
  getStudentNotifications,
  getStudentResultDetail,
  getStudentSessions,
} from '../controllers/student.controller.js';
import {
  getCourseProgress,
  postLectureComplete,
} from '../controllers/studentLectureProgress.controller.js';
import { getStudentTests, postStudentTestStart } from '../controllers/studentTests.controller.js';
import {
  getStudentAttempt,
  postStudentAttemptAnswer,
} from '../controllers/studentAttempts.controller.js';
import {
  getStudentQuestionById,
  getStudentQuestionFormContextHandler,
  getStudentQuestionThreadById,
  getStudentQuestionThreadId,
  getStudentQuestionThreads,
  getStudentQuestions,
  postStudentQuestion,
} from '../controllers/studentQuestions.controller.js';
import { postStudentQuestionAttachment } from '../controllers/studentQuestionUpload.controller.js';
import { postStudentQuestionAudioRecording } from '../controllers/studentQuestionAudioUpload.controller.js';
import {
  autosaveRateLimit,
  requireRedisForAutosave,
} from '../middleware/autosaveRateLimit.js';
import { requireCsrf } from '../middleware/csrf.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  studentQuestionCreateBurstLimit,
  studentQuestionCreateIpLimit,
  studentQuestionCreateStudentDailyLimit,
  studentQuestionCreateStudentHourlyLimit,
  studentQuestionReadBurstLimit,
  studentQuestionReadIpLimit,
  studentQuestionReadStudentLimit,
  studentQuestionUploadBurstLimit,
  studentQuestionUploadIpLimit,
  studentQuestionUploadStudentLimit,
  studentQuestionAudioUploadBurstLimit,
  studentQuestionAudioUploadIpLimit,
  studentQuestionAudioUploadStudentLimit,
} from '../middleware/studentQuestionRateLimit.js';

const router = Router();
router.use(rejectStudentBearerInProduction);
router.use(enforcePolicy({ auth: 'student', verified: true, maxRisk: 'elevated' }));
router.get('/enrollment-status', getStudentEnrollmentStatus);
router.get('/dashboard', getStudentDashboardData);
router.get('/notifications', getStudentNotifications);
router.get('/my-course', getStudentMyCourseData);
router.get('/sessions', getStudentSessions);
router.get('/progress/:courseId', getCourseProgress);
router.post('/lectures/:lectureId/complete', requireCsrf, postLectureComplete);
router.get('/test-history', getStudentTestHistoryHandler);
router.get('/tests', getStudentTests);
router.post('/tests/:testId/start', requireCsrf, postStudentTestStart);
router.get('/attempts/:attemptId', getStudentAttempt);
router.post(
  '/attempts/:attemptId/answer',
  requireCsrf,
  requireRedisForAutosave,
  autosaveRateLimit,
  postStudentAttemptAnswer
);
router.get('/questions/form-context', getStudentQuestionFormContextHandler);
router.get(
  '/question-threads',
  studentQuestionReadBurstLimit,
  studentQuestionReadStudentLimit,
  studentQuestionReadIpLimit,
  getStudentQuestionThreads
);
router.get(
  '/question-threads/:threadId',
  studentQuestionReadBurstLimit,
  studentQuestionReadStudentLimit,
  studentQuestionReadIpLimit,
  getStudentQuestionThreadById
);
router.get(
  '/questions',
  studentQuestionReadBurstLimit,
  studentQuestionReadStudentLimit,
  studentQuestionReadIpLimit,
  getStudentQuestions
);
router.post(
  '/questions/recording',
  requireCsrf,
  studentQuestionAudioUploadBurstLimit,
  studentQuestionAudioUploadStudentLimit,
  studentQuestionAudioUploadIpLimit,
  postStudentQuestionAudioRecording
);
router.post(
  '/questions/attachment',
  requireCsrf,
  studentQuestionUploadBurstLimit,
  studentQuestionUploadStudentLimit,
  studentQuestionUploadIpLimit,
  postStudentQuestionAttachment
);
router.post(
  '/questions',
  requireCsrf,
  idempotencyMiddleware,
  studentQuestionCreateBurstLimit,
  studentQuestionCreateStudentHourlyLimit,
  studentQuestionCreateStudentDailyLimit,
  studentQuestionCreateIpLimit,
  postStudentQuestion
);
router.get(
  '/questions/:id/thread-id',
  studentQuestionReadBurstLimit,
  studentQuestionReadStudentLimit,
  studentQuestionReadIpLimit,
  getStudentQuestionThreadId
);
router.get(
  '/questions/:id',
  studentQuestionReadBurstLimit,
  studentQuestionReadStudentLimit,
  studentQuestionReadIpLimit,
  getStudentQuestionById
);
router.get('/results/:attemptId', getStudentResultDetail);

export default router;

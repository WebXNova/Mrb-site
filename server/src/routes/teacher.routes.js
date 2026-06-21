import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { rejectTeacherBearerInProduction } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { getTeacherProfile } from '../controllers/teacher.controller.js';
import {
  getTeacherQuestionById,
  getTeacherQuestionStudentContextHandler,
  getTeacherQuestionThreadById,
  getTeacherQuestionThreadId,
  getTeacherQuestionThreads,
  getTeacherQuestions,
  patchTeacherQuestionPin,
  postTeacherQuestionAnswer,
  postTeacherThreadChatMessage,
  patchTeacherQuestionAnswer,
} from '../controllers/teacherQuestions.controller.js';
import { postTeacherAnswerAttachment } from '../controllers/teacherQuestionAnswerUpload.controller.js';
import { postTeacherAnswerRecording } from '../controllers/teacherQuestionAnswerAudioUpload.controller.js';
import {
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailIpLimit,
  teacherQuestionDetailTeacherLimit,
} from '../middleware/teacherQuestionDetailRateLimit.js';
import {
  teacherAnswerCreateBurstLimit,
  teacherAnswerCreateIpLimit,
  teacherAnswerCreateTeacherLimit,
} from '../middleware/teacherQuestionAnswerRateLimit.js';
import {
  teacherAnswerUpdateBurstLimit,
  teacherAnswerUpdateIpLimit,
} from '../middleware/qaMonitoringRateLimit.js';
import {
  teacherAudioUploadRateLimits,
  teacherImageUploadRateLimits,
} from '../middleware/teacherUploadRateLimit.js';

const router = Router();
router.use(rejectTeacherBearerInProduction);
router.use(enforcePolicy({ auth: 'teacher', maxRisk: 'elevated' }));
router.get('/me', getTeacherProfile);
router.get(
  '/question-threads',
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  teacherQuestionDetailIpLimit,
  getTeacherQuestionThreads
);
router.get(
  '/question-threads/:threadId',
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  teacherQuestionDetailIpLimit,
  getTeacherQuestionThreadById
);
router.post(
  '/question-threads/:threadId/messages',
  requireCsrf,
  idempotencyMiddleware,
  teacherAnswerCreateBurstLimit,
  teacherAnswerCreateTeacherLimit,
  teacherAnswerCreateIpLimit,
  postTeacherThreadChatMessage
);
router.get(
  '/questions',
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  teacherQuestionDetailIpLimit,
  getTeacherQuestions
);
router.post(
  '/questions/answer/attachment',
  requireCsrf,
  ...teacherImageUploadRateLimits,
  postTeacherAnswerAttachment
);
router.post(
  '/questions/answer/recording',
  requireCsrf,
  ...teacherAudioUploadRateLimits,
  postTeacherAnswerRecording
);
router.get(
  '/questions/:questionId/thread-id',
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  teacherQuestionDetailIpLimit,
  getTeacherQuestionThreadId
);
router.get(
  '/questions/:questionId/student-context',
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  teacherQuestionDetailIpLimit,
  getTeacherQuestionStudentContextHandler
);
router.patch(
  '/questions/:questionId/pin',
  requireCsrf,
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  patchTeacherQuestionPin
);
router.get(
  '/questions/:questionId',
  teacherQuestionDetailBurstLimit,
  teacherQuestionDetailTeacherLimit,
  teacherQuestionDetailIpLimit,
  getTeacherQuestionById
);
router.post(
  '/questions/:questionId/answer',
  requireCsrf,
  idempotencyMiddleware,
  teacherAnswerCreateBurstLimit,
  teacherAnswerCreateTeacherLimit,
  teacherAnswerCreateIpLimit,
  postTeacherQuestionAnswer
);
router.patch(
  '/questions/:questionId/answer',
  requireCsrf,
  teacherAnswerUpdateBurstLimit,
  teacherAnswerUpdateIpLimit,
  patchTeacherQuestionAnswer
);

export default router;

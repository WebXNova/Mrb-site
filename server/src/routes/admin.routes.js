import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  getDashboard,
  getLogs,
  getUsers,
  putUserStatus,
} from '../controllers/admin.controller.js';
import { postCourse, putCourse, removeCourse } from '../controllers/courses.controller.js';
import { postCourseImage } from '../controllers/courseImageUpload.controller.js';
import { postCourseWizard } from '../controllers/courseWizard.controller.js';
import { getCoursePricing, putCoursePricing } from '../controllers/coursePricing.controller.js';
import {
  getLectures,
  postLecture,
  putLecture,
  removeLecture,
} from '../controllers/lectures.controller.js';
import {
  getTest,
  getTests,
  getTestCreateOptions,
  getTestResultsExport,
  getTestCompletenessHandler,
  getTestRules,
  getTestSettings,
  patchTestBasicInfo,
  patchTestRules,
  patchTestSettings,
  postDuplicateTest,
  postTest,
  postTestPublish,
  putTest,
  putTestPublish,
  removeTest,
} from '../controllers/tests.controller.js';
import {
  deleteBulkUnlinkTestQuestions,
  deleteUnlinkTestQuestion,
  getAvailableTestQuestions,
  getLinkedTestQuestions,
  postLinkTestQuestion,
  putReorderTestQuestions,
} from '../controllers/testQuestions.controller.js';
import {
  deleteAdminStudentQuestion,
  getAdminStudentQuestions,
  putAdminStudentQuestionAnswer,
} from '../controllers/adminStudentQuestions.controller.js';
import {
  getAdminContactRemarks,
  putAdminContactRemarkRead,
} from '../controllers/contactRemarks.controller.js';
import {
  deleteSubject,
  getSubject,
  getSubjects,
  postSubject,
  putSubject,
  putSubjectsReorder,
} from '../controllers/subjects.controller.js';
import courseBatchAdminRoutes from './courseBatch.routes.js';
import chapterRoutes from './chapter.routes.js';
import questionImportRoutes from './questionImportRoutes.js';
import { courseImageUploadRateLimit } from '../middleware/courseImageUploadRateLimit.js';
import { courseWizardWriteRateLimit } from '../middleware/courseWizardWriteRateLimit.js';
import { testWriteRateLimit } from '../middleware/testWriteRateLimit.js';
import { testQuestionBulkRateLimit } from '../middleware/testQuestionBulkRateLimit.js';
import { rejectAdminBearer } from '../security/admin/rejectAdminBearer.js';
import { adminCsrfProtection } from '../security/admin/adminCsrfProtection.js';
import { requireQuestionBankStaff } from '../middleware/requireQuestionBankStaff.js';
import {
  questionBankImageUploadIpRateLimit,
  questionBankImageUploadUserRateLimit,
} from '../middleware/questionBankImageUploadRateLimit.js';
import { postQuestionBankImage } from '../controllers/questionBankImageUpload.controller.js';

const router = Router();

router.post(
  '/questions/upload-image',
  rejectAdminBearer,
  requireQuestionBankStaff,
  adminCsrfProtection,
  questionBankImageUploadIpRateLimit,
  questionBankImageUploadUserRateLimit,
  postQuestionBankImage
);

router.use(adminSecurityStack);
router.use(enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }));

router.get('/dashboard', getDashboard);
router.get('/logs', getLogs);

router.get('/users', getUsers);
router.put('/users/:userId/status', putUserStatus);

router.post(
  '/courses/wizard',
  courseWizardWriteRateLimit,
  idempotencyMiddleware,
  postCourseWizard
);
router.post('/courses', postCourse);
router.post(
  '/courses/upload-image',
  courseImageUploadRateLimit,
  postCourseImage
);
router.put('/courses/:courseId', putCourse);
router.delete('/courses/:courseId', removeCourse);

router.get('/courses/:courseId/pricing', getCoursePricing);
router.put('/courses/:courseId/pricing', putCoursePricing);

router.get('/courses/:courseId/subjects', getSubjects);
router.post('/courses/:courseId/subjects', postSubject);
router.put('/courses/:courseId/subjects/reorder', putSubjectsReorder);
router.get('/courses/:courseId/subjects/:subjectId', getSubject);
router.put('/courses/:courseId/subjects/:subjectId', putSubject);
router.delete('/courses/:courseId/subjects/:subjectId', deleteSubject);

router.use('/chapters', chapterRoutes);

router.use('/questions', questionImportRoutes);

router.use(courseBatchAdminRoutes);

router.get('/lectures', getLectures);
router.post('/lectures', postLecture);
router.put('/lectures/:lectureId', putLecture);
router.delete('/lectures/:lectureId', removeLecture);

router.get('/tests', getTests);
router.get('/tests/create-options', getTestCreateOptions);
router.get('/tests/:testId', getTest);
router.post('/tests', testWriteRateLimit, postTest);
router.patch('/tests/:testId/basic-info', testWriteRateLimit, patchTestBasicInfo);
router.get('/tests/:testId/completeness', getTestCompletenessHandler);
router.get('/tests/:testId/rules', getTestRules);
router.patch('/tests/:testId/rules', testWriteRateLimit, patchTestRules);
router.get('/tests/:testId/settings', getTestSettings);
router.patch('/tests/:testId/settings', testWriteRateLimit, patchTestSettings);
router.put('/tests/:testId', putTest);
router.delete('/tests/:testId', removeTest);
router.post('/tests/:testId/publish', testWriteRateLimit, postTestPublish);
router.put('/tests/:testId/publish', testWriteRateLimit, putTestPublish);
router.post('/tests/:testId/duplicate', postDuplicateTest);
router.get('/tests/:testId/results/export', getTestResultsExport);

router.get('/tests/:testId/questions/available', getAvailableTestQuestions);
router.put('/tests/:testId/questions/reorder', putReorderTestQuestions);
router.get('/tests/:testId/questions', getLinkedTestQuestions);
router.post('/tests/:testId/questions', testQuestionBulkRateLimit, postLinkTestQuestion);
router.delete('/tests/:testId/questions', testQuestionBulkRateLimit, deleteBulkUnlinkTestQuestions);
router.delete('/tests/:testId/questions/:questionId', deleteUnlinkTestQuestion);

router.get('/student-questions', getAdminStudentQuestions);
router.put('/student-questions/:id', putAdminStudentQuestionAnswer);
router.delete('/student-questions/:id', deleteAdminStudentQuestion);
router.get('/remarks', getAdminContactRemarks);
router.put('/remarks/:remarkId/read', putAdminContactRemarkRead);

export default router;

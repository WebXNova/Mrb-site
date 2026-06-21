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
import {
  getCourseDraftHandler,
  postCourseDraftSaveHandler,
} from '../controllers/courseDraft.controller.js';
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
  getTestResultsAnalyticsHandler,
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
import { getLinkedTestQuestions } from '../controllers/testQuestions.controller.js';
import {
  getRichContentTestExport,
  getTestExport,
  postTestExport,
} from '../controllers/testExport.controller.js';
import {
  postTestImportConfirm,
  postTestImportPreview,
  postTestImportValidate,
  postRichContentTestImport,
  postRichContentTestImportPreview,
} from '../controllers/testImport.controller.js';
import {
  getTestExportHistory,
  getTestExportHistoryBatch,
  getTestImportHistory,
  getTestImportHistoryBatch,
  getTestTransferDashboard,
  getTestTransferLogs,
} from '../controllers/testTransferHistory.controller.js';
import {
  deleteAdminStudentQuestion,
  getAdminStudentQuestions,
  putAdminStudentQuestionAnswer,
} from '../controllers/adminStudentQuestions.controller.js';
import {
  getQaMonitoringAnswers,
  getQaMonitoringExport,
  getQaMonitoringQuestionDetail,
  getQaMonitoringQuestions,
  getQaMonitoringStatisticsHandler,
  getQaMonitoringTeacherActivity,
} from '../controllers/adminQaMonitoring.controller.js';
import {
  getTeacherInsightsActivityFeedHandler,
  getTeacherInsightsDashboard,
  getTeacherInsightsTeacherDetail,
} from '../controllers/adminTeacherInsights.controller.js';
import {
  getAdminContactRemarks,
  postAdminContactRemarkPublish,
  postAdminContactRemarkUnpublish,
  putAdminContactRemarkRead,
} from '../controllers/contactRemarks.controller.js';
import {
  deleteSubject,
  getSubject,
  getSubjects,
  getUniqueActiveSubjects,
  postSubject,
  putSubject,
  putSubjectsReorder,
} from '../controllers/subjects.controller.js';
import courseBatchAdminRoutes from './courseBatch.routes.js';
import chapterRoutes from './chapter.routes.js';
import questionImportRoutes from './questionImportRoutes.js';
import {
  courseImageUploadIpRateLimit,
  courseImageUploadUserRateLimit,
} from '../middleware/courseImageUploadRateLimit.js';
import { courseWizardWriteRateLimit } from '../middleware/courseWizardWriteRateLimit.js';
import { testWriteRateLimit } from '../middleware/testWriteRateLimit.js';
import { requireUnpublishedTest } from '../middleware/requireUnpublishedTest.js';
import { rejectAdminBearer } from '../security/admin/rejectAdminBearer.js';
import { adminCsrfProtection } from '../security/admin/adminCsrfProtection.js';
import { requireQuestionBankStaff } from '../middleware/requireQuestionBankStaff.js';
import {
  questionBankImageUploadIpRateLimit,
  questionBankImageUploadUserRateLimit,
} from '../middleware/questionBankImageUploadRateLimit.js';
import { postQuestionBankImage } from '../controllers/questionBankImageUpload.controller.js';
import { postCreateTeacher, patchTeacherStatus, getTeachers, getTeacher, putUpdateTeacher } from '../controllers/teachers.controller.js';
import {
  qaMonitoringExportLimit,
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
} from '../middleware/qaMonitoringRateLimit.js';

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

router.post('/teachers/create', idempotencyMiddleware, postCreateTeacher);
router.get('/teachers', getTeachers);
router.get('/teachers/:teacherId', getTeacher);
router.put('/teachers/:teacherId', putUpdateTeacher);
router.patch('/teachers/:teacherId/status', patchTeacherStatus);

router.post(
  '/courses/wizard',
  courseWizardWriteRateLimit,
  idempotencyMiddleware,
  postCourseWizard
);
router.get('/course-drafts/load', getCourseDraftHandler);
router.post('/course-drafts/save', postCourseDraftSaveHandler);
router.post('/courses', postCourse);
router.post(
  '/courses/upload-image',
  courseImageUploadIpRateLimit,
  courseImageUploadUserRateLimit,
  postCourseImage
);
router.put('/courses/:courseId', putCourse);
router.delete('/courses/:courseId', removeCourse);

router.get('/courses/:courseId/pricing', getCoursePricing);
router.put('/courses/:courseId/pricing', putCoursePricing);

router.get('/courses/:courseId/subjects', getSubjects);
router.get('/subjects/unique-active', getUniqueActiveSubjects);
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
router.get('/tests/transfer/dashboard', getTestTransferDashboard);
router.get('/tests/transfer/export-history', getTestExportHistory);
router.get('/tests/transfer/export-history/:batchId', getTestExportHistoryBatch);
router.get('/tests/transfer/import-history', getTestImportHistory);
router.get('/tests/transfer/import-history/:batchId', getTestImportHistoryBatch);
router.get('/tests/transfer/logs', getTestTransferLogs);
router.post('/tests/import', testWriteRateLimit, postTestImportConfirm);
router.post('/tests/import/validate', testWriteRateLimit, postTestImportValidate);
router.post('/tests/import/preview', testWriteRateLimit, postTestImportPreview);
router.post('/tests/import/confirm', testWriteRateLimit, postTestImportConfirm);
router.post('/tests/import/rich/preview', testWriteRateLimit, postRichContentTestImportPreview);
router.post('/tests/import/rich', testWriteRateLimit, postRichContentTestImport);
router.post('/tests/:testId/export', testWriteRateLimit, postTestExport);
router.get('/tests/:testId/export', testWriteRateLimit, getTestExport);
router.get('/tests/:testId/export/rich', testWriteRateLimit, getRichContentTestExport);
router.get('/tests/:testId', getTest);
router.post('/tests', testWriteRateLimit, postTest);
router.patch('/tests/:testId/basic-info', testWriteRateLimit, patchTestBasicInfo);
router.get('/tests/:testId/completeness', getTestCompletenessHandler);
router.get('/tests/:testId/rules', getTestRules);
router.patch('/tests/:testId/rules', testWriteRateLimit, patchTestRules);
router.get('/tests/:testId/settings', getTestSettings);
router.patch('/tests/:testId/settings', testWriteRateLimit, patchTestSettings);
router.put('/tests/:testId', requireUnpublishedTest, putTest);
router.delete('/tests/:testId', testWriteRateLimit, requireUnpublishedTest, removeTest);
router.post('/tests/:testId/publish', testWriteRateLimit, idempotencyMiddleware, postTestPublish);
router.put('/tests/:testId/publish', testWriteRateLimit, putTestPublish);
router.post('/tests/:testId/duplicate', testWriteRateLimit, postDuplicateTest);
router.get('/tests/:testId/results/analytics', getTestResultsAnalyticsHandler);
router.get('/tests/:testId/results/export', testWriteRateLimit, getTestResultsExport);

router.get('/tests/:testId/questions', getLinkedTestQuestions);

router.get('/student-questions', getAdminStudentQuestions);
router.put('/student-questions/:id', putAdminStudentQuestionAnswer);
router.delete('/student-questions/:id', deleteAdminStudentQuestion);

router.get(
  '/qa-monitoring/statistics',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getQaMonitoringStatisticsHandler
);
router.get(
  '/qa-monitoring/questions',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getQaMonitoringQuestions
);
router.get(
  '/qa-monitoring/questions/:questionId',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getQaMonitoringQuestionDetail
);
router.get(
  '/qa-monitoring/answers',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getQaMonitoringAnswers
);
router.get(
  '/qa-monitoring/teacher-activity',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getQaMonitoringTeacherActivity
);
router.get(
  '/qa-monitoring/export',
  qaMonitoringExportLimit,
  qaMonitoringReadIpLimit,
  getQaMonitoringExport
);

router.get(
  '/teacher-insights/dashboard',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getTeacherInsightsDashboard
);
router.get(
  '/teacher-insights/activity-feed',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getTeacherInsightsActivityFeedHandler
);
router.get(
  '/teacher-insights/teachers/:teacherId',
  qaMonitoringReadBurstLimit,
  qaMonitoringReadIpLimit,
  getTeacherInsightsTeacherDetail
);

router.get('/remarks', getAdminContactRemarks);
router.put('/remarks/:remarkId/read', putAdminContactRemarkRead);
router.post('/remarks/:remarkId/post', postAdminContactRemarkPublish);
router.post('/remarks/:remarkId/unpost', postAdminContactRemarkUnpublish);

export default router;

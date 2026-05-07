import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  getDashboard,
  getLogs,
  getUsers,
  putUserStatus,
} from '../controllers/admin.controller.js';
import {
  getCourses,
  postCourse,
  putCourse,
  removeCourse,
} from '../controllers/courses.controller.js';
import {
  getLectures,
  postLecture,
  putLecture,
  removeLecture,
} from '../controllers/lectures.controller.js';
import {
  getTests,
  getTestQuestions,
  getTestResultsExport,
  importFileUpload,
  postDuplicateTest,
  postTestQuestionsImportConfirm,
  postTestQuestionsImportPreviewFile,
  postTestQuestionsImportPreview,
  postTest,
  postTestQuestion,
  putTest,
  putTestPublish,
  putTestQuestion,
  removeTest,
  removeTestQuestion,
} from '../controllers/tests.controller.js';
import {
  deleteAdminStudentQuestion,
  getAdminStudentQuestions,
  putAdminStudentQuestionAnswer,
} from '../controllers/adminStudentQuestions.controller.js';
import {
  getAdminContactRemarks,
  putAdminContactRemarkRead,
} from '../controllers/contactRemarks.controller.js';

const router = Router();

router.use(requireAdmin);

router.get('/dashboard', getDashboard);
router.get('/logs', getLogs);

router.get('/users', getUsers);
router.put('/users/:userId/status', putUserStatus);

router.get('/courses', getCourses);
router.post('/courses', postCourse);
router.put('/courses/:courseId', putCourse);
router.delete('/courses/:courseId', removeCourse);

router.get('/lectures', getLectures);
router.post('/lectures', postLecture);
router.put('/lectures/:lectureId', putLecture);
router.delete('/lectures/:lectureId', removeLecture);

router.get('/tests', getTests);
router.post('/tests', postTest);
router.put('/tests/:testId', putTest);
router.delete('/tests/:testId', removeTest);
router.put('/tests/:testId/publish', putTestPublish);
router.post('/tests/:testId/duplicate', postDuplicateTest);
router.get('/tests/:testId/results/export', getTestResultsExport);

router.get('/tests/:testId/questions', getTestQuestions);
router.post('/tests/:testId/questions', postTestQuestion);
router.post('/tests/:testId/questions/import/preview', postTestQuestionsImportPreview);
router.post('/tests/:testId/questions/import/preview-file', importFileUpload, postTestQuestionsImportPreviewFile);
router.post('/tests/:testId/questions/import/confirm', postTestQuestionsImportConfirm);
router.put('/tests/:testId/questions/:questionId', putTestQuestion);
router.delete('/tests/:testId/questions/:questionId', removeTestQuestion);

router.get('/student-questions', getAdminStudentQuestions);
router.put('/student-questions/:id', putAdminStudentQuestionAnswer);
router.delete('/student-questions/:id', deleteAdminStudentQuestion);
router.get('/remarks', getAdminContactRemarks);
router.put('/remarks/:remarkId/read', putAdminContactRemarkRead);

export default router;

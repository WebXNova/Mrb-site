import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  getDashboard,
  getLogs,
  getMrbCodes,
  getUsers,
  putUserStatus,
  postMrbCodes,
  removeMrbCode,
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
  postTest,
  postTestQuestion,
  putTest,
  putTestPublish,
  putTestQuestion,
  removeTest,
  removeTestQuestion,
} from '../controllers/tests.controller.js';

const router = Router();

router.use(requireAdmin);

router.get('/dashboard', getDashboard);
router.get('/logs', getLogs);

router.get('/users', getUsers);
router.put('/users/:userId/status', putUserStatus);

router.get('/mrb-codes', getMrbCodes);
router.post('/mrb-codes', postMrbCodes);
router.delete('/mrb-codes/:codeId', removeMrbCode);

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

router.get('/tests/:testId/questions', getTestQuestions);
router.post('/tests/:testId/questions', postTestQuestion);
router.put('/tests/:testId/questions/:questionId', putTestQuestion);
router.delete('/tests/:testId/questions/:questionId', removeTestQuestion);

export default router;

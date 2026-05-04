import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { requireStudentMrbEnrollment } from '../middleware/requireStudentMrbEnrollment.js';
import { getStudentDashboardData, getStudentResultDetail } from '../controllers/student.controller.js';
import {
  getStudentQuestionById,
  getStudentQuestions,
  postStudentQuestion,
} from '../controllers/studentQuestions.controller.js';
import { postStudentQuestionAttachment } from '../controllers/studentQuestionUpload.controller.js';

const router = Router();
router.use(requireStudent);
router.use(requireStudentMrbEnrollment);
router.get('/dashboard', getStudentDashboardData);
router.get('/questions', getStudentQuestions);
router.post('/questions/attachment', postStudentQuestionAttachment);
router.post('/questions', postStudentQuestion);
router.get('/questions/:id', getStudentQuestionById);
router.get('/results/:attemptId', getStudentResultDetail);

export default router;

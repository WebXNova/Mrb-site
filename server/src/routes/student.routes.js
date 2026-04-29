import { Router } from 'express';
import { requireStudent } from '../middleware/auth.js';
import { getStudentDashboardData, getStudentResultDetail } from '../controllers/student.controller.js';

const router = Router();
router.use(requireStudent);
router.get('/dashboard', getStudentDashboardData);
router.get('/results/:attemptId', getStudentResultDetail);

export default router;

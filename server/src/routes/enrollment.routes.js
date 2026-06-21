import { Router } from 'express';
import { authMiddleware, rejectStudentBearerInProduction } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import {
  enrollmentCreateRateLimit,
  requireRedisForEnrollmentCreate,
} from '../middleware/enrollmentCreateRateLimit.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import { enforcePolicy } from '../auth/securityPolicy.js';
import {
  createEnrollment,
  getAdminEnrollments,
  getAdminEnrollmentsSummary,
  getEnrollmentPrefillData,
  getEnrollmentState,
  getUserEnrollments,
  postAdminEnrollmentSuspendStudent,
  putAdminEnrollmentStatus,
} from '../controllers/enrollment.controller.js';

const router = Router();

router.get('/me', rejectStudentBearerInProduction, authMiddleware, getUserEnrollments);
router.get(
  '/prefill-data',
  rejectStudentBearerInProduction,
  authMiddleware,
  getEnrollmentPrefillData
);
router.get(
  '/state/:courseId',
  rejectStudentBearerInProduction,
  authMiddleware,
  getEnrollmentState
);
router.post(
  '/',
  rejectStudentBearerInProduction,
  authMiddleware,
  requireRedisForEnrollmentCreate,
  enrollmentCreateRateLimit,
  requireCsrf,
  createEnrollment
);

export const adminEnrollmentRouter = Router();
adminEnrollmentRouter.use(adminSecurityStack);
adminEnrollmentRouter.use(enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }));
adminEnrollmentRouter.get('/', getAdminEnrollments);
adminEnrollmentRouter.get('/summary', getAdminEnrollmentsSummary);
adminEnrollmentRouter.put('/:enrollmentId/status', putAdminEnrollmentStatus);
adminEnrollmentRouter.post('/:enrollmentId/suspend-student', postAdminEnrollmentSuspendStudent);

export default router;

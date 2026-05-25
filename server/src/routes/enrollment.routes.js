import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import {
  getAdminEnrollments,
  postEnrollment,
  putAdminEnrollmentStatus,
} from '../controllers/enrollment.controller.js';

const router = Router();

router.post('/', authMiddleware, postEnrollment);
router.post('/draft', authMiddleware, postEnrollment);

const adminEnrollmentRouter = Router();
adminEnrollmentRouter.use(adminSecurityStack);
adminEnrollmentRouter.use(enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }));
adminEnrollmentRouter.get('/', getAdminEnrollments);
adminEnrollmentRouter.put('/:enrollmentId/status', putAdminEnrollmentStatus);

router.use('/admin', adminEnrollmentRouter);

export default router;

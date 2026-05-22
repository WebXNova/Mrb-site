import { Router } from 'express';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';
import {
  getAdminEnrollments,
  postEnrollment,
  putAdminEnrollmentStatus,
} from '../controllers/enrollment.controller.js';

const router = Router();

router.post('/', authMiddleware, postEnrollment);
router.post('/draft', authMiddleware, postEnrollment);
router.get('/admin', requireAdmin, getAdminEnrollments);
router.put('/admin/:enrollmentId/status', requireAdmin, putAdminEnrollmentStatus);

export default router;

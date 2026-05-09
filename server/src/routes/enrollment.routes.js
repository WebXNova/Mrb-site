import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  getAdminEnrollments,
  getEnrollmentTracking,
  postEnrollment,
  putAdminEnrollmentStatus,
} from '../controllers/enrollment.controller.js';

const router = Router();

router.get('/track/:token', getEnrollmentTracking);
router.post('/', postEnrollment);
router.get('/admin', requireAdmin, getAdminEnrollments);
router.put('/admin/:enrollmentId/status', requireAdmin, putAdminEnrollmentStatus);

export default router;

import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { getCoursePublicById, getCoursesAdminRead, getCoursesPublic } from '../controllers/coursesRead.controller.js';
import { getPublicCourseBatches } from '../controllers/courseBatch.controller.js';

const router = Router();

router.get('/public', getCoursesPublic);
router.get('/admin', enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }), getCoursesAdminRead);
router.get('/:courseId/batches', getPublicCourseBatches);
router.get('/:id', getCoursePublicById);

export default router;

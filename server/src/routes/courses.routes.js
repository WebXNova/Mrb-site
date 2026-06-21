import { Router } from 'express';
import { getCoursePublicById, getCoursesPublic, getPublicCourseSubjects } from '../controllers/coursesRead.controller.js';
import { getPublicCourseBatches } from '../controllers/courseBatch.controller.js';
import { getPublicTestMeta } from '../controllers/publicTests.controller.js';

const router = Router();

router.get('/public', getCoursesPublic);
router.get('/public/tests/:slug', getPublicTestMeta);
router.get('/:courseId/batches', getPublicCourseBatches);
router.get('/:courseId/subjects', getPublicCourseSubjects);
router.get('/:id', getCoursePublicById);

export default router;

import { Router } from 'express';
import {
  getCoursePublicById,
  getCoursesPublic,
  getPublicCourseCategories,
  getPublicCourseSubjects,
} from '../controllers/coursesRead.controller.js';
import { getPublicCourseBatches } from '../controllers/courseBatch.controller.js';
import { getPublicTestMeta } from '../controllers/publicTests.controller.js';
import studentCourseNotesRoutes from './studentCourseNotes.routes.js';

const router = Router();

router.get('/public', getCoursesPublic);
router.get('/categories', getPublicCourseCategories);
router.get('/public/tests/:slug', getPublicTestMeta);
router.get('/:courseId/batches', getPublicCourseBatches);
router.get('/:courseId/subjects', getPublicCourseSubjects);
router.use('/:courseId', studentCourseNotesRoutes);
router.get('/:id', getCoursePublicById);

export default router;

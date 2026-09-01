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
import { getStudentCourseLeaderboardHandler } from '../controllers/courseLeaderboard.controller.js';
import { studentLeaderboardReadLimit } from '../middleware/courseLeaderboardRateLimit.js';

const router = Router();

router.get('/public', getCoursesPublic);
router.get('/categories', getPublicCourseCategories);
router.get('/public/tests/:slug', getPublicTestMeta);
router.get('/:courseId/batches', getPublicCourseBatches);
router.get('/:courseId/subjects', getPublicCourseSubjects);
router.get('/:courseId/leaderboard', studentLeaderboardReadLimit, getStudentCourseLeaderboardHandler);
router.use('/:courseId', studentCourseNotesRoutes);
router.get('/:id', getCoursePublicById);

export default router;

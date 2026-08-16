import { Router } from 'express';
import {
  getCourseCategories,
  postCourseCategory,
  putCourseCategoriesReorder,
  putCourseCategory,
  putCourseCategoryActivate,
  putCourseCategoryDeactivate,
} from '../controllers/courseCategories.controller.js';

const router = Router();

router.get('/', getCourseCategories);
router.put('/reorder', putCourseCategoriesReorder);
router.post('/', postCourseCategory);
router.put('/:id', putCourseCategory);
router.put('/:id/activate', putCourseCategoryActivate);
router.put('/:id/deactivate', putCourseCategoryDeactivate);

export default router;

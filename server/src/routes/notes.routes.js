import { Router } from 'express';
import {
  getCourseNoteFileHandler,
  getCourseNoteHandler,
  putCourseNoteActivateHandler,
  putCourseNoteDeactivateHandler,
  putCourseNoteHandler,
} from '../controllers/courseNotes.controller.js';

const router = Router();

router.get('/:id/file', getCourseNoteFileHandler);
router.get('/:id', getCourseNoteHandler);
router.put('/:id/activate', putCourseNoteActivateHandler);
router.put('/:id/deactivate', putCourseNoteDeactivateHandler);
router.put('/:id', putCourseNoteHandler);

export default router;

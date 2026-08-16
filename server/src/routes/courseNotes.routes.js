import { Router } from 'express';
import {
  getCourseNotesHandler,
  postCourseNoteHandler,
  postCourseNoteUploadMiddleware,
} from '../controllers/courseNotes.controller.js';

const router = Router({ mergeParams: true });

router.get('/', getCourseNotesHandler);
router.post('/', postCourseNoteUploadMiddleware, postCourseNoteHandler);

export default router;

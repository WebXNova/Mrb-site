import { Router } from 'express';
import {
  getStudentChapterNotesHandler,
  getStudentCourseNotesHandler,
  getStudentLectureNotesHandler,
  getStudentSubjectNotesHandler,
} from '../controllers/studentCourseNotes.controller.js';

const router = Router({ mergeParams: true });

router.get('/notes', getStudentCourseNotesHandler);
router.get('/subjects/:subjectId/notes', getStudentSubjectNotesHandler);
router.get('/chapters/:chapterId/notes', getStudentChapterNotesHandler);
router.get('/lectures/:lectureId/notes', getStudentLectureNotesHandler);

export default router;

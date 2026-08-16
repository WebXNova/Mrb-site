import { Router } from 'express';
import { getStudentNoteDownloadHandler } from '../controllers/studentCourseNotes.controller.js';

const router = Router();

router.get('/:noteId/download', getStudentNoteDownloadHandler);

export default router;

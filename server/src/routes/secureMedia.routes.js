import { Router } from 'express';
import { getSecureUpload } from '../controllers/secureMedia.controller.js';

/**
 * CEE secure uploads — mounted at /api/uploads (grid applies policy before handler).
 * Pattern: GET /api/uploads/:namespace/:filename
 *
 * Namespaces: student-qa | course-covers | question-bank
 * question-bank uses uploads_question_bank grid rule (identity); access enforced in secureMedia.service.
 */
const router = Router();
router.get('/:namespace/:filename', getSecureUpload);

export default router;

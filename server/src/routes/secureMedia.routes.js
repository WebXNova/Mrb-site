import { Router } from 'express';
import { getSecureUpload } from '../controllers/secureMedia.controller.js';

/**
 * CEE secure uploads — mounted at /api/uploads (grid applies entitlement before handler).
 * Pattern: GET /api/uploads/:namespace/:filename
 */
const router = Router();
router.get('/:namespace/:filename', getSecureUpload);

export default router;

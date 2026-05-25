import { Router } from 'express';
import { courseBatchWriteRateLimit } from '../middleware/courseBatchWriteRateLimit.js';
import {
  getAdminCourseBatches,
  postAdminCourseBatch,
  postAdminBatchArchive,
  postAdminBatchReactivate,
  putAdminBatch,
} from '../controllers/courseBatch.controller.js';

/**
 * Mounted under `/api/admin`; CSRF + bearer rejection are enforced by `adminSecurityStack` on the parent router.
 */
const router = Router();

router.get('/courses/:courseId/batches', getAdminCourseBatches);
router.post('/courses/:courseId/batches', courseBatchWriteRateLimit, postAdminCourseBatch);
router.put('/batches/:batchId', courseBatchWriteRateLimit, putAdminBatch);
router.post('/batches/:batchId/archive', courseBatchWriteRateLimit, postAdminBatchArchive);
router.post('/batches/:batchId/reactivate', courseBatchWriteRateLimit, postAdminBatchReactivate);

export default router;

import { Router } from 'express';
import { rejectAuthHeaderInProduction } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { courseBatchWriteRateLimit } from '../middleware/courseBatchWriteRateLimit.js';
import {
  getAdminCourseBatches,
  postAdminCourseBatch,
  postAdminBatchArchive,
  postAdminBatchReactivate,
  putAdminBatch,
} from '../controllers/courseBatch.controller.js';

const router = Router();

router.use(rejectAuthHeaderInProduction);

router.get('/courses/:courseId/batches', getAdminCourseBatches);
router.post('/courses/:courseId/batches', courseBatchWriteRateLimit, requireCsrf, postAdminCourseBatch);
router.put('/batches/:batchId', courseBatchWriteRateLimit, requireCsrf, putAdminBatch);
router.post('/batches/:batchId/archive', courseBatchWriteRateLimit, requireCsrf, postAdminBatchArchive);
router.post('/batches/:batchId/reactivate', courseBatchWriteRateLimit, requireCsrf, postAdminBatchReactivate);

export default router;

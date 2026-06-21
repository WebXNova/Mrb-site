import { Router } from 'express';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import { questionBankImportRateLimit } from '../middleware/questionBankWriteRateLimit.js';
import {
  getAikenImportBatch,
  getAikenImportBatchesForQuestion,
  importAiken,
  listAikenImportBatches,
  previewAiken,
} from '../controllers/questionImportController.js';

const router = Router();

router.use(adminSecurityStack);

router.get('/import/aiken/batches', listAikenImportBatches);
router.get('/import/aiken/batches/:batchId', getAikenImportBatch);
router.get('/import/aiken/questions/:questionId/batches', getAikenImportBatchesForQuestion);
router.post('/import/aiken/preview', questionBankImportRateLimit, previewAiken);
router.post('/import/aiken', questionBankImportRateLimit, importAiken);

export default router;

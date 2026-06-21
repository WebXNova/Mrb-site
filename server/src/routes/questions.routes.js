import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import {
  questionBankBulkRateLimit,
  questionBankWriteRateLimit,
} from '../middleware/questionBankWriteRateLimit.js';
import { requireQuestionBankWritable } from '../middleware/requireQuestionBankWritable.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import {
  postBulkAssignQuestionsToTest,
  postBulkDeleteQuestions,
  postBulkExportQuestions,
} from '../controllers/questionBulk.controller.js';
import { deleteQuestion, getQuestion, getQuestions, postQuestion, putQuestion } from '../controllers/questions.controller.js';

const router = Router();

router.use(adminSecurityStack);
router.use(enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }));

router.get('/', getQuestions);
router.post('/bulk/delete', questionBankBulkRateLimit, requireQuestionBankWritable, postBulkDeleteQuestions);
router.post('/bulk/export', questionBankBulkRateLimit, postBulkExportQuestions);
router.post('/bulk/assign-test', questionBankBulkRateLimit, postBulkAssignQuestionsToTest);
router.post('/', questionBankWriteRateLimit, postQuestion);
router.put('/:id', questionBankWriteRateLimit, requireQuestionBankWritable, putQuestion);
router.delete('/:id', questionBankWriteRateLimit, requireQuestionBankWritable, deleteQuestion);
router.get('/:id', getQuestion);

/** Future: router.post('/import', questionBankImportRateLimit, postQuestionImport); */

export default router;

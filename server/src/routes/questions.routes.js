import { Router } from 'express';
import { enforcePolicy } from '../auth/securityPolicy.js';
import { questionBankWriteRateLimit } from '../middleware/questionBankWriteRateLimit.js';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import { deleteQuestion, getQuestion, getQuestions, postQuestion, putQuestion } from '../controllers/questions.controller.js';

const router = Router();

router.use(adminSecurityStack);
router.use(enforcePolicy({ auth: 'admin', maxRisk: 'elevated' }));

router.get('/', getQuestions);
router.post('/', questionBankWriteRateLimit, postQuestion);
router.put('/:id', questionBankWriteRateLimit, putQuestion);
router.delete('/:id', questionBankWriteRateLimit, deleteQuestion);
router.get('/:id', getQuestion);

/** Future: router.post('/import', questionBankImportRateLimit, postQuestionImport); */

export default router;

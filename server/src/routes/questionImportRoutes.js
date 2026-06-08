import { Router } from 'express';
import { adminSecurityStack } from '../security/admin/adminSecurityStack.js';
import { importAiken } from '../controllers/questionImportController.js';

const router = Router();

router.use(adminSecurityStack);

router.post('/import/aiken', importAiken);

export default router;

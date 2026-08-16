import { Router } from 'express';
import {
  getPaymentAccountAuditLog,
  getPaymentAccounts,
  postPaymentAccount,
  putPaymentAccount,
  putPaymentAccountActivate,
  putPaymentAccountDeactivate,
} from '../controllers/paymentAccounts.controller.js';
import { requirePaymentAccountWriteAccess } from '../middleware/requirePaymentAccountWriteAccess.js';
import { paymentAccountWriteRateLimit } from '../middleware/paymentAccountWriteRateLimit.js';

const router = Router();

router.get('/', getPaymentAccounts);
router.get('/:id/audit-log', getPaymentAccountAuditLog);

const writeStack = [requirePaymentAccountWriteAccess, paymentAccountWriteRateLimit];

router.post('/', ...writeStack, postPaymentAccount);
router.put('/:id', ...writeStack, putPaymentAccount);
router.put('/:id/activate', ...writeStack, putPaymentAccountActivate);
router.put('/:id/deactivate', ...writeStack, putPaymentAccountDeactivate);

export default router;

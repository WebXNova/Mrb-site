import { Router } from 'express';
import { providerFeedbackWebhook } from '../controllers/emailProvider.controller.js';
import { providerWebhookRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/provider-feedback', providerWebhookRateLimit, providerFeedbackWebhook);

export default router;


import { Router } from 'express';
import { providerFeedbackWebhook } from '../controllers/emailProvider.controller.js';
import { providerWebhookRateLimit } from '../middleware/rateLimit.js';
import {
  attachEmailWebhookRawBody,
  emailWebhookExpressRaw,
  requireEmailWebhookJsonContentType,
  requireEmailWebhookOperational,
} from '../middleware/emailProviderWebhook.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Email provider webhook ingress — mount in app.js BEFORE express.json() on /api/email.
 *
 * Stack: rate limit → operational gate → MIME → raw body + JSON parse → handler
 */
export const emailProviderWebhookRouter = Router();
emailProviderWebhookRouter.post(
  '/provider-feedback',
  asyncHandler(providerWebhookRateLimit),
  requireEmailWebhookOperational,
  requireEmailWebhookJsonContentType,
  emailWebhookExpressRaw(),
  attachEmailWebhookRawBody,
  providerFeedbackWebhook
);

/** Reserved for future JSON email admin routes (mounted after express.json). */
const router = Router();
export default router;

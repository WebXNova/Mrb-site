import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { postCreatePaymentSession, postPaymentWebhook } from '../controllers/payments.controller.js';
import {
  attachSafepayWebhookRawBody,
  requireSafepayWebhookJsonContentType,
  safepayWebhookExpressRaw,
} from '../middleware/safepayWebhook.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { safepayPaymentWebhookRateLimit } from '../middleware/rateLimit.js';

/**
 * Safepay payment webhook ingress — MUST be mounted in `app.js` **before** `express.json()` on the same
 * `/api/payments` prefix so the signing secret is validated against untouched raw octets (not JSON re-serialisation).
 *
 * Stack order:
 * 1. Burst control (Redis/in-memory counters)
 * 2. MIME gate (415 unless `application/json`)
 * 3. `express.raw({ type, verify })` bounded size — `verify` binds exact signing octets to `req.rawBody`
 * 4. `attachSafepayWebhookRawBody` — UTF‑8 fatal check; reconciles `req.rawBody` (from `verify`) with `req.body`
 */
export const paymentsWebhookRouter = Router();
paymentsWebhookRouter.post(
  '/webhook',
  asyncHandler(safepayPaymentWebhookRateLimit),
  requireSafepayWebhookJsonContentType,
  safepayWebhookExpressRaw(),
  attachSafepayWebhookRawBody,
  postPaymentWebhook
);

/** JSON API routes requiring `express.json()` upstream */
export const paymentsApiRouter = Router();
paymentsApiRouter.post('/create-session', authMiddleware, postCreatePaymentSession);

export default paymentsApiRouter;

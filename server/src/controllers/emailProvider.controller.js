import { z } from 'zod';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';
import { mysqlPool } from '../config/mysql.js';
import { getRedisClient } from '../config/redis.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

const feedbackSchema = z.object({
  email: z.string().trim().email(),
  event: z.enum(['bounce', 'complaint', 'block']),
  reason: z.string().trim().max(255).optional(),
});

export const providerFeedbackWebhook = asyncHandler(async (req, res) => {
  const secret = req.get('x-email-webhook-secret') || '';
  if (!env.queue.emailWebhookSecret || secret !== env.queue.emailWebhookSecret) {
    throw new ApiError(403, 'Webhook secret invalid');
  }
  const timestamp = Number(req.get('x-email-webhook-timestamp') || '0');
  const signature = String(req.get('x-email-webhook-signature') || '');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(nowSeconds - timestamp) > env.queue.emailWebhookToleranceSeconds) {
    throw new ApiError(401, 'Webhook timestamp invalid');
  }
  if (!env.queue.emailWebhookSignatureSecret) {
    throw new ApiError(503, 'Webhook signature secret is not configured');
  }
  const canonicalBody = JSON.stringify(req.body || {});
  const expectedSignature = crypto
    .createHmac('sha256', env.queue.emailWebhookSignatureSecret)
    .update(`${timestamp}.${canonicalBody}`)
    .digest('hex');
  const left = Buffer.from(signature, 'utf8');
  const right = Buffer.from(expectedSignature, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    throw new ApiError(401, 'Webhook signature invalid');
  }
  const redis = getRedisClient();
  if (redis) {
    const replayKey = `webhook:email:signature:${signature}`;
    const existed = await redis.get(replayKey);
    if (existed) {
      throw new ApiError(409, 'Webhook replay rejected');
    }
    await redis.set(replayKey, '1', { EX: env.queue.emailWebhookToleranceSeconds });
  }
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid feedback payload', parsed.error.flatten());
  }
  await mysqlPool.query(
    `INSERT INTO email_suppressions (email, reason, source, active)
     VALUES (?, ?, 'provider_webhook', TRUE)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), active = TRUE, updated_at = CURRENT_TIMESTAMP`,
    [parsed.data.email.toLowerCase(), `${parsed.data.event}:${parsed.data.reason || 'provider_signal'}`]
  );
  sendSuccess(res, { acknowledged: true });
});


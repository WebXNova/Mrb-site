import crypto from 'crypto';
import { ApiError } from '../utils/apiError.js';
import { getEmailWebhookRuntimeConfig } from '../security/emailWebhookConfig.js';

const HEADER_SECRET = 'x-email-webhook-secret';
const HEADER_TIMESTAMP = 'x-email-webhook-timestamp';
const HEADER_SIGNATURE = 'x-email-webhook-signature';

function timingSafeHexEqual(provided, expected) {
  const left = Buffer.from(String(provided || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Verify shared secret, timestamp skew, and HMAC signature over raw body.
 *
 * Contract: signature = HMAC-SHA256(signatureSecret, `${timestamp}.${rawBodyUtf8}`).hex
 *
 * @param {import('express').Request} req
 * @param {{ rawBody: Buffer }} options
 */
export function verifyEmailWebhookRequest(req, { rawBody }) {
  const config = getEmailWebhookRuntimeConfig();
  if (!config.operational) {
    throw new ApiError(503, 'Email provider webhook is not configured', {
      code: 'EMAIL_WEBHOOK_NOT_CONFIGURED',
    });
  }

  const providedSecret = String(req.get(HEADER_SECRET) || '');
  if (!providedSecret || !timingSafeHexEqual(providedSecret, config.sharedSecret)) {
    throw new ApiError(403, 'Webhook secret invalid', { code: 'EMAIL_WEBHOOK_SECRET_INVALID' });
  }

  const timestamp = Number(req.get(HEADER_TIMESTAMP) || '0');
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new ApiError(401, 'Webhook timestamp invalid', { code: 'EMAIL_WEBHOOK_TIMESTAMP_MISSING' });
  }
  if (Math.abs(nowSeconds - timestamp) > config.toleranceSeconds) {
    throw new ApiError(401, 'Webhook timestamp invalid', { code: 'EMAIL_WEBHOOK_TIMESTAMP_EXPIRED' });
  }

  const signature = String(req.get(HEADER_SIGNATURE) || '').trim();
  if (!signature) {
    throw new ApiError(401, 'Webhook signature missing', { code: 'EMAIL_WEBHOOK_SIGNATURE_MISSING' });
  }

  const canonical = `${timestamp}.${rawBody.toString('utf8')}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.signatureSecret)
    .update(canonical)
    .digest('hex');

  if (!timingSafeHexEqual(signature, expectedSignature)) {
    throw new ApiError(401, 'Webhook signature invalid', { code: 'EMAIL_WEBHOOK_SIGNATURE_INVALID' });
  }

  return { timestamp, signature, digest: buildEmailWebhookDedupeDigest({ timestamp, signature, rawBody }) };
}

/**
 * @param {{ timestamp: number, signature: string, rawBody: Buffer }} input
 */
export function buildEmailWebhookDedupeDigest({ timestamp, signature, rawBody }) {
  return crypto
    .createHash('sha256')
    .update(String(timestamp))
    .update('\n')
    .update(String(signature))
    .update('\n')
    .update(rawBody)
    .digest('hex');
}

export const EMAIL_WEBHOOK_HEADERS = Object.freeze({
  secret: HEADER_SECRET,
  timestamp: HEADER_TIMESTAMP,
  signature: HEADER_SIGNATURE,
});

import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { env } from '../config/env.js';
import { createPaymentSession, fulfillSafepayWebhookVerified } from '../services/payments.service.js';
import { verifySafepayWebhookSignature } from '../services/safepay.service.js';
import {
  buildSafepayWebhookDedupeDigest,
  isSafepayWebhookReplaySeen,
  markSafepayWebhookReplayAck,
} from '../services/safepayWebhookReplay.service.js';

const createSessionSchema = z.object({
  enrollment_id: z.coerce.number().int().positive().optional(),
  enrollmentId: z.coerce.number().int().positive().optional(),
  course_id: z.coerce.number().int().positive().optional(),
  courseId: z.coerce.number().int().positive().optional(),
});

const WH_VERBOSE_LOG =
  String(process.env.SAFEPAY_WEBHOOK_REQUEST_LOG || '')
    .trim()
    .toLowerCase() === 'true';

export const postCreatePaymentSession = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid payment session payload', parsed.error.flatten());
  }

  const enrollmentId = parsed.data.enrollment_id ?? parsed.data.enrollmentId;
  const courseId = parsed.data.course_id ?? parsed.data.courseId;
  if (!enrollmentId || !courseId) {
    throw new ApiError(400, 'enrollment_id and course_id are required');
  }

  const result = await createPaymentSession({
    userId,
    enrollmentId,
    courseId,
  });

  sendSuccess(res, {
    order_id: result.orderId,
    enrollment_id: result.enrollmentId,
    course_id: result.courseId,
    amount: result.amount,
    currency: result.currency,
    checkout_url: result.checkoutUrl,
  });
});

/** Express may expose duplicate headers as string[] — keep first value for webhook signing headers. */
function flattenIncomingHeaders(req) {
  const out = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    const k = key.toLowerCase();
    if (typeof value === 'string' && value.trim()) {
      out[k] = value.trim();
    } else if (Array.isArray(value) && value.length) {
      const first = String(value[0] ?? '').trim();
      if (first) out[k] = first;
    }
  }
  return out;
}

/**
 * Structured ingress logging — never logs raw bodies, webhook secrets, or full signatures.
 */
function logWebhookIngress(summary) {
  if (!WH_VERBOSE_LOG && env.nodeEnv === 'production') return;
  console.log(JSON.stringify({ tag: '[payments.webhook.ingress]', ...summary }));
}

/**
 * Production Safepay ingress:
 * 1. `express.raw({ verify })` sets `req.rawBody` via body-parser **`verify`** (canonical Buffer for HMAC strings).
 * 2. Verify before JSON-driven side effects / Redis replay bookkeeping.
 * 3. Replay cache (Redis) short-circuit only after cryptographic verification.
 * 4. Fulfillment stays transactional inside `fulfillSafepayWebhookVerified` (MySQL + idempotent updates).
 *
 * WHY no `SAFEPAY_WEBHOOK_VERIFY_BYPASS`:
 * Bypasses are catastrophic for settlement — omitted entirely per security policy.
 */
export const postPaymentWebhook = asyncHandler(async (req, res) => {
  const requestId = req.requestId || null;

  logWebhookIngress({
    requestId,
    stage: 'hit',
    contentLengthHeader: req.get('content-length') ?? null,
  });

  const headers = flattenIncomingHeaders(req);

  /** Byte-exact signing input: set in `express.raw({ verify })` and reconciled in `attachSafepayWebhookRawBody`. */
  const rawBodyBuffer =
    Buffer.isBuffer(req.rawBody) && req.rawBody.length ? req.rawBody : Buffer.alloc(0);

  if (!rawBodyBuffer.length) {
    logWebhookIngress({ requestId, stage: 'reject', reason: 'empty_raw_body' });
    return res.status(400).json({ received: false });
  }

  let payload;
  try {
    payload = JSON.parse(rawBodyBuffer.toString('utf8'));
  } catch {
    logWebhookIngress({ requestId, stage: 'reject', reason: 'json_parse_failed' });
    return res.status(400).json({ received: false });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    logWebhookIngress({ requestId, stage: 'reject', reason: 'json_not_object' });
    return res.status(400).json({ received: false });
  }

  const signatureHeader = headers['x-sfpy-signature'] || '';
  const timestampHeader = headers['x-sfpy-timestamp'] || '';

  const verifyResult = verifySafepayWebhookSignature({
    rawBodyBuffer,
    headers,
    payload: null,
  });

  if (!verifyResult.ok) {
    console.error(
      JSON.stringify({
        tag: '[payments.webhook]',
        requestId,
        stage: 'verify_reject',
        branch: verifyResult.branch,
      })
    );
    if (verifyResult.branch === 'missing_x_sfpy_timestamp' || verifyResult.branch === 'invalid_timestamp') {
      return res.status(400).json({ received: false });
    }
    if (verifyResult.branch === 'invalid_utf8_body') {
      return res.status(400).json({ received: false });
    }
    if (verifyResult.branch === 'timestamp_outside_skew') {
      return res.status(401).json({ received: false });
    }
    if (verifyResult.branch === 'verification_threw') {
      return res.status(500).json({ received: false });
    }
    if (
      verifyResult.branch === 'missing_webhook_secret' ||
      verifyResult.branch === 'invalid_webhook_secret_hex'
    ) {
      return res.status(503).json({ received: false });
    }
    return res.status(401).json({ received: false });
  }

  const dedupeDigest = buildSafepayWebhookDedupeDigest({
    signatureHeader,
    timestampHeader,
    rawBodyBuffer,
  });

  if (await isSafepayWebhookReplaySeen(dedupeDigest)) {
    logWebhookIngress({ requestId, stage: 'replay_cache_hit', dedupeDigestPrefix: dedupeDigest.slice(0, 12) });
    return res.status(200).json({ received: true, replay: true });
  }

  let result;
  try {
    result = await fulfillSafepayWebhookVerified({ payload });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error('[payments.webhook] fulfillment crash', {
        requestId,
        name: error?.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (error instanceof ApiError) {
      if (WH_VERBOSE_LOG || env.nodeEnv !== 'production') {
        console.error(
          JSON.stringify({
            tag: '[payments.webhook]',
            requestId,
            stage: 'fulfillment_error',
            statusCode: error.statusCode,
            message: error.message,
          })
        );
      }

      const clientPayload =
        env.nodeEnv === 'production'
          ? { received: false }
          : {
              received: false,
              message: error.message,
              details: error.details,
            };

      if (error.statusCode === 404) return res.status(404).json(clientPayload);
      if (error.statusCode === 400) return res.status(400).json(clientPayload);
      if (error.statusCode === 401) return res.status(401).json(clientPayload);
      if (error.statusCode === 409) return res.status(409).json(clientPayload);
      return res.status(500).json(clientPayload);
    }

    return res.status(500).json({ received: false });
  }

  await markSafepayWebhookReplayAck(dedupeDigest);

  logWebhookIngress({
    requestId,
    stage: 'processed',
    orderId: result?.orderId ?? null,
    enrollmentId: result?.enrollmentId ?? null,
  });

  const body =
    env.nodeEnv === 'production'
      ? { received: true, ...(result?.duplicate === true ? { duplicate: true } : {}) }
      : { received: true, ...result };

  return res.status(200).json(body);
});

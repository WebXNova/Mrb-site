import crypto from 'crypto';
import Safepay from '@sfpy/node-core';
import { TextDecoder } from 'node:util';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { majorUnitsToMinorUnits } from './safepayWebhookSettlement.js';

function safepayApiHost() {
  return env.safepay.apiHost;
}

function checkoutEnv() {
  return env.safepay.env === 'production' ? 'production' : 'sandbox';
}

function shouldLogSafepayVerbose() {
  return (
    env.nodeEnv === 'development' ||
    String(process.env.SAFEPAY_DEBUG || '').trim().toLowerCase() === 'true'
  );
}

function assertSafepayConfigured() {
  if (!env.safepay.apiKey || !env.safepay.publicKey) {
    throw new ApiError(500, 'Payment gateway is not configured');
  }
}

let cachedClient = null;
let cachedClientKey = '';

function getSafepayClient() {
  assertSafepayConfigured();
  const host = safepayApiHost();
  const key = `${host}\0${env.safepay.apiKey}\0${env.safepay.publicKey}`;
  if (!cachedClient || cachedClientKey !== key) {
    cachedClient = new Safepay(env.safepay.apiKey, {
      host,
      authType: 'secret',
    });
    cachedClientKey = key;
  }
  return cachedClient;
}

/**
 * Currency amount in LMS DB is interpreted as decimal major units (e.g. PKR rupees).
 * Safepay session API expects smallest units (paisas); adjust if dashboard shows wrong totals.
 */
function toMinorUnits(amount, currency) {
  void currency;
  try {
    return majorUnitsToMinorUnits(amount);
  } catch {
    throw new ApiError(400, 'Invalid payment amount');
  }
}

function formatTrackerForLog(token) {
  const s = String(token || '');
  if (s.length <= 20) return s;
  return `${s.slice(0, 12)}…${s.slice(-6)}`;
}

function logSafepayEvent(message, detail = undefined) {
  if (detail === undefined) {
    console.log(`[safepay] ${message}`);
    return;
  }
  if (shouldLogSafepayVerbose()) {
    console.log(`[safepay] ${message}`, typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  } else {
    console.log(`[safepay] ${message}`, typeof detail === 'object' ? '(see SAFEPAY_DEBUG=true for full payload)' : detail);
  }
}

function sdkErrorMessage(err) {
  if (!err) return 'Safepay request failed';
  return (
    err?.raw?.message ||
    err?.message ||
    err?.raw?.status?.message ||
    (Array.isArray(err?.raw?.status?.errors) && err.raw.status.errors[0]) ||
    String(err)
  );
}

/**
 * Express / Hosted Checkout: session (tracker) → passport (`tbt`) → SDK checkout URL.
 * @param {{ amount: number, currency?: string, orderId: number, enrollmentId: number, courseId: number }}
 */
export async function createSafepayHostedCheckoutSession({
  amount,
  currency = 'PKR',
  orderId,
  enrollmentId,
  courseId,
}) {
  const client = getSafepayClient();
  const minorAmount = toMinorUnits(amount, currency);

  logSafepayEvent('hosted checkout bootstrap', {
    apiHost: safepayApiHost(),
    SAFEPAY_ENV: env.safepay.env,
    merchantApiKeyLen: env.safepay.publicKey.length,
    merchantSecretLen: env.safepay.apiKey.length,
  });
  const sessionPayload = {
    merchant_api_key: env.safepay.publicKey,
    intent: 'CYBERSOURCE',
    mode: 'payment',
    entry_mode: 'raw',
    currency: String(currency).toUpperCase(),
    amount: minorAmount,
    // Safepay allows only documented metadata keys — custom keys such as enrollment_id reject the session.
    metadata: {
      order_id: String(orderId),
    },
    include_fees: false,
  };

  let sessionRes;
  try {
    sessionRes = await client.payments.session.setup(sessionPayload);
  } catch (err) {
    console.error('[safepay] payments.session.setup failed:', sdkErrorMessage(err));
    if (shouldLogSafepayVerbose()) console.error('[safepay] session.setup error raw:', err);
    throw new ApiError(500, sdkErrorMessage(err));
  }

  logSafepayEvent('payments.session.setup response', sessionRes);

  const trackerToken = sessionRes?.data?.tracker?.token;
  if (!trackerToken || String(trackerToken).trim() === '') {
    console.error('[safepay] session.setup missing data.tracker.token');
    throw new ApiError(500, 'Safepay did not return a tracker token');
  }

  logSafepayEvent('tracker token (truncated)', formatTrackerForLog(trackerToken));

  let passportRes;
  try {
    passportRes = await client.client.passport.create({});
  } catch (err) {
    console.error('[safepay] client.passport.create failed:', sdkErrorMessage(err));
    if (shouldLogSafepayVerbose()) console.error('[safepay] passport.create error raw:', err);
    throw new ApiError(500, sdkErrorMessage(err));
  }

  logSafepayEvent('auth.passport.create response shape', passportRes);

  const passportData = passportRes?.data;
  let tbt = null;
  if (typeof passportData === 'string') {
    tbt = passportData;
  } else if (
    passportData !== undefined &&
    passportData !== null &&
    typeof passportData === 'object' &&
    passportData.token !== undefined &&
    passportData.token !== null
  ) {
    tbt = String(passportData.token);
  }

  if (!tbt || tbt.trim() === '') {
    console.error('[safepay] passport.create missing tbt in response.data');
    throw new ApiError(500, 'Safepay did not return a passport token (tbt)');
  }

  if (shouldLogSafepayVerbose()) {
    logSafepayEvent('passport tbt (truncated)', `${tbt.slice(0, 18)}…(len=${tbt.length})`);
  } else {
    console.log(`[safepay] passport tbt generated (len=${tbt.length})`);
  }

  const baseClient = env.clientUrl.replace(/\/+$/, '');
  const redirect_url = `${baseClient}/enrollment/payment/success?order_id=${encodeURIComponent(
    String(orderId)
  )}&enrollment_id=${encodeURIComponent(String(enrollmentId))}`;
  const cancel_url = `${baseClient}/enrollment/payment/failed?enrollment_id=${encodeURIComponent(
    String(enrollmentId)
  )}&course_id=${encodeURIComponent(String(courseId))}&order_id=${encodeURIComponent(String(orderId))}`;

  let checkoutUrl;
  try {
    checkoutUrl = client.checkout.createCheckoutUrl({
      env: checkoutEnv(),
      tbt,
      tracker: String(trackerToken),
      source: 'hosted',
      redirect_url,
      cancel_url,
      order_id: String(orderId),
    });
  } catch (err) {
    console.error('[safepay] checkout.createCheckoutUrl failed:', err?.message || err);
    throw new ApiError(500, 'Safepay checkout URL generation failed');
  }

  logSafepayEvent('hosted checkout URL (SDK)', checkoutUrl);

  const trackerOpaque =
    sessionRes?.data?.tracker && typeof sessionRes.data.tracker === 'object'
      ? sessionRes.data.tracker.client != null && String(sessionRes.data.tracker.client).length <= 255
        ? String(sessionRes.data.tracker.client)
        : null
      : null;

  return {
    token: String(trackerToken),
    tracker: trackerOpaque,
    checkoutUrl,
    rawSession: sessionRes,
  };
}

/**
 * Safepay webhook signing secret: HMAC key = Buffer.from(SAFEPAY_WEBHOOK_SECRET, 'hex') (64 hex chars).
 */
function buildSafepayWebhookSigningKeyFromHex(hexRaw) {
  const raw = String(hexRaw || '').trim();
  if (!/^[a-fA-F0-9]{64}$/.test(raw)) return null;
  return Buffer.from(raw, 'hex');
}

/** Strip optional `sha512=` / `sha256=` / `v1=` prefix; return lowercase hex body for comparison. */
function normalizeSignatureHeaderValue(header) {
  let h = String(header || '').trim();
  const lower = h.toLowerCase();
  if (lower.startsWith('sha512=')) h = h.slice(7);
  else if (lower.startsWith('sha256=')) h = h.slice(7);
  else if (lower.startsWith('v1=')) h = h.slice(3);
  return h.trim().toLowerCase();
}

/** Refuse ill‑formed UTF‑8 so `buf.toString('utf8')` cannot introduce U+FFFD divergences vs the provider’s signing input. */
const WEBHOOK_BODY_UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * Parse Safepay `X-SFPY-TIMESTAMP` as Unix seconds (supports numeric seconds or millis strings).
 * @param {string} timestampHeader
 * @returns {number | null}
 */
function parseSafepayWebhookEpochSeconds(timestampHeader) {
  const trimmed = String(timestampHeader || '').trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e12) return Math.floor(n / 1000);
  return Math.floor(n);
}

/**
 * Webhook verification — matches Safepay production signing:
 * - Secret: SAFEPAY_WEBHOOK_SECRET as 64-char hex → Buffer.from(..., 'hex') (no base64).
 * - Payload: `${X-SFPY-TIMESTAMP}.${rawBodyUtf8}` (string), HMAC-SHA512, digest hex.
 * - Raw body must be the exact bytes received (UTF-8 string used for the dotted message).
 * - Timestamp only from X-SFPY-TIMESTAMP (no payload fallbacks).
 *
 * @param {{ rawBodyBuffer: Buffer, headers: Record<string, string>, payload?: object | null }}
 */
export function verifySafepayWebhookSignature({ rawBodyBuffer, headers, payload: _payload = null }) {
  const webhookCrashDbg =
    String(process.env.SAFEPAY_WEBHOOK_CRASH_DEBUG || '').trim().toLowerCase() === 'true';

  const logOutcome = (result) => {
    const verboseVerify =
      env.nodeEnv !== 'production' ||
      String(process.env.SAFEPAY_DEBUG || '').trim().toLowerCase() === 'true';
    if (!verboseVerify && result.ok) return result;
    if (result.ok) {
      console.log(JSON.stringify({ tag: '[VERIFY]', ...result }));
    } else {
      console.error(JSON.stringify({ tag: '[VERIFY]', ...result }));
    }
    return result;
  };

  try {
  const signatureHeader = headers['x-sfpy-signature'] || '';
  const timestampHeader = headers['x-sfpy-timestamp'] || '';

  if (!env.safepay.webhookSecretIsDedicated || !env.safepay.webhookSecretHex) {
    return logOutcome({
      ok: false,
      branch: 'missing_webhook_secret',
      reason: 'Set SAFEPAY_WEBHOOK_SECRET to the 64-character hexadecimal webhook signing secret',
    });
  }

  const key = buildSafepayWebhookSigningKeyFromHex(env.safepay.webhookSecretHex);
  if (!key) {
    return logOutcome({
      ok: false,
      branch: 'invalid_webhook_secret_hex',
      reason: 'SAFEPAY_WEBHOOK_SECRET must be exactly 64 hexadecimal characters (32 bytes)',
    });
  }

  if (!timestampHeader || !String(timestampHeader).trim()) {
    return logOutcome({
      ok: false,
      branch: 'missing_x_sfpy_timestamp',
      reason: 'Missing X-SFPY-TIMESTAMP header (required for signature verification)',
      detail: { rawBodyByteLength: Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer.length : 0 },
    });
  }

  const epochSeconds = parseSafepayWebhookEpochSeconds(timestampHeader);
  if (epochSeconds === null) {
    return logOutcome({
      ok: false,
      branch: 'invalid_timestamp',
      reason: 'X-SFPY-TIMESTAMP must be a positive numeric Unix time (seconds or milliseconds)',
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const skewCap = Math.max(30, Number(env.safepay.webhookTimestampSkewSeconds ?? 300));
  if (Math.abs(nowSec - epochSeconds) > skewCap) {
    return logOutcome({
      ok: false,
      branch: 'timestamp_outside_skew',
      reason: `Webhook timestamp outside ±${skewCap}s acceptance window`,
      detail: { skewSeconds: skewCap },
    });
  }

  if (!signatureHeader || !String(signatureHeader).trim()) {
    return logOutcome({
      ok: false,
      branch: 'missing_signature_header',
      reason: 'Missing X-SFPY-SIGNATURE header',
    });
  }

  if (!Buffer.isBuffer(rawBodyBuffer) || rawBodyBuffer.length === 0) {
    return logOutcome({
      ok: false,
      branch: 'missing_raw_body_buffer',
      reason:
        'Webhook verification requires `req.rawBody` from raw parser verify (`express.raw`), not parsed JSON/stringify',
      detail: { isBuffer: Buffer.isBuffer(rawBodyBuffer) },
    });
  }

  try {
    WEBHOOK_BODY_UTF8.decode(rawBodyBuffer);
  } catch {
    return logOutcome({
      ok: false,
      branch: 'invalid_utf8_body',
      reason:
        'Request body contains invalid UTF-8; cannot construct the signed string reproducibly versus Safepay',
    });
  }

  const rawBodyUtf8 = rawBodyBuffer.toString('utf8');
  const timestamp = String(timestampHeader).trim();
  const signedPayload = `${timestamp}.${rawBodyUtf8}`;

  const expectedSignature = crypto.createHmac('sha512', key).update(signedPayload, 'utf8').digest('hex');
  const receivedHex = normalizeSignatureHeaderValue(signatureHeader);

  if (receivedHex.length !== 128) {
    return logOutcome({
      ok: false,
      branch: 'unsupported_signature_length',
      reason: `After normalize, X-SFPY-SIGNATURE must be 128 hex characters (HMAC-SHA512); got ${receivedHex.length}`,
      detail: { normalizedHexLength: receivedHex.length },
    });
  }

  if (webhookCrashDbg) {
    const bodyPrefix =
      Buffer.isBuffer(rawBodyBuffer) && rawBodyBuffer.length > 0
        ? crypto.createHash('sha256').update(rawBodyBuffer).digest('hex').slice(0, 16)
        : null;
    console.log(
      JSON.stringify({
        tag: '[VERIFY_DIAG]',
        rawBodyByteLength: Buffer.isBuffer(rawBodyBuffer) ? rawBodyBuffer.length : 0,
        bodySha256Prefix: bodyPrefix,
        timestampHeaderLen: String(timestampHeader).length,
        signatureHeaderLen: String(signatureHeader).length,
      })
    );
  }

  const expectedHexLower = String(expectedSignature).toLowerCase();
  const receivedHexLower = String(receivedHex).toLowerCase();
  const expectedBuffer = Buffer.from(expectedHexLower, 'utf8');
  const receivedBuffer = Buffer.from(receivedHexLower, 'utf8');

  if (webhookCrashDbg) {
    console.log('SIGNATURE DEBUG:', {
      expectedLength: expectedBuffer.length,
      receivedLength: receivedBuffer.length,
    });
  }

  if (expectedBuffer.length !== receivedBuffer.length) {
    console.error('SIGNATURE LENGTH MISMATCH');
    return logOutcome({
      ok: false,
      branch: 'signature_length_mismatch',
      reason: 'signature_length_mismatch',
      detail: {
        expectedLength: expectedBuffer.length,
        receivedLength: receivedBuffer.length,
      },
    });
  }

  const match = crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

  if (match) {
    return logOutcome({
      ok: true,
      branch: 'safepay_hmac_sha512_timestamp_dot_raw_body_utf8',
      detail: {
        rawBodyByteLength: rawBodyBuffer.length,
        hmac: 'sha512',
        hmacKeyByteLength: key.length,
      },
    });
  }

  return logOutcome({
    ok: false,
    branch: 'signature_mismatch',
    reason:
      'HMAC-SHA512 does not match X-SFPY-SIGNATURE. Confirm 64-char hex SAFEPAY_WEBHOOK_SECRET, X-SFPY-TIMESTAMP, and that the raw body is unchanged.',
    detail: {
      rawBodyByteLength: rawBodyBuffer.length,
      hmacKeyByteLength: key.length,
      hmac: 'sha512',
    },
  });
  } catch (err) {
    console.error('[VERIFY] === WEBHOOK CRASH ===');
    console.error('NAME:', err?.name);
    console.error('MESSAGE:', err?.message);
    console.error('STACK:', err?.stack);
    console.error('FULL ERROR:', err);
    return logOutcome({
      ok: false,
      branch: 'verification_threw',
      reason: String(err?.message || err || 'unknown'),
      detail: {
        crash: true,
        name: err?.name,
        stack: err?.stack,
      },
    });
  }
}

export function extractSafepayTokenFromWebhook(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload?.data?.token,
    payload?.data?.tracker,
    typeof payload?.data?.tracker === 'object' ? payload?.data?.tracker?.token : null,
    payload?.tracker,
    payload?.token,
    payload?.payment?.token,
    payload?.payment?.tracker,
    payload?.object?.token,
  ];
  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

export function extractSafepayTransactionIdFromWebhook(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload?.data?.transaction_id,
    payload?.data?.reference,
    payload?.data?.reference_code,
    payload?.reference,
    payload?.reference_code,
    payload?.transaction_id,
    payload?.payment?.transaction_id,
  ];
  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
}

export {
  ALLOWED_SUCCESS_EVENTS,
  ALLOWED_SUCCESS_EVENT_TYPES,
  ALLOWED_SUCCESS_TRACKER_STATES,
  classifySafepayWebhookEvent,
  isSafepayPaymentSuccessEvent,
  logSafepayWebhookEventDecision,
} from './safepayWebhookEventValidation.js';

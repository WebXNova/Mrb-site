/**
 * Safepay payment webhook ingress — MUST be mounted before `express.json()` for the same path prefix.
 *
 * CRYPTOGRAPHIC CONTRACT (Safepay HMAC-SHA512):
 * Signed string = `${X-SFPY-TIMESTAMP}.${rawBody_utf8}`
 * Therefore the verifier MUST use the exact TLS/app-layer octets Safepay hashed — not JSON.parse/stringify output.
 *
 * We capture those octets via body-parser **`verify`** (runs on the authoritative Buffer immediately after read /
 * decompress inside this parser instance). Relying solely on `req.body` after parse is brittle across versions;
 * `verify` receives the canonical `buf` that participates in HMAC construction on the wire.
 */
import express from 'express';
import { TextDecoder } from 'node:util';
import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';

const JSON_MIME = 'application/json';

/** Fatal UTF‑8 rejects U+FFFD substitution before `JSON.parse` — keeps HMAC string aligned with well‑formed JSON payloads. */
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });

/**
 * @param {string | undefined} headerValue
 * @returns {boolean}
 */
export function isSafepayWebhookJsonContentType(headerValue) {
  if (!headerValue) return false;
  const base = String(headerValue).split(';')[0].trim().toLowerCase();
  return base === JSON_MIME;
}

/**
 * Reject spoofed / confused MIME (415) before raw parser runs — avoids `type` mismatch leaving `req.body` empty.
 */
export function requireSafepayWebhookJsonContentType(req, _res, next) {
  const ct = req.get('content-type');
  if (!ct || !isSafepayWebhookJsonContentType(ct)) {
    return next(
      new ApiError(415, `Content-Type must be ${JSON_MIME}`, {
        branch: 'unsupported_media_type',
      })
    );
  }
  return next();
}

function safepayWebhookMimeMatcher(req) {
  return isSafepayWebhookJsonContentType(req.get('content-type'));
}

/**
 * Capture exact signing bytes for downstream HMAC.
 * @type {NonNullable<Parameters<typeof express.raw>[0]>['verify']}
 */
export function safepayWebhookRawVerify(req, res, buf /*, encoding */) {
  if (!Buffer.isBuffer(buf)) return;
  const maxBytes = Math.max(1024, Number(env.safepay.webhookMaxPayloadBytes || 524288));
  if (buf.length > maxBytes) {
    const err = new Error('Payload too large');
    err.status = 413;
    err.type = 'entity.too.large';
    throw err;
  }
  if (buf.length === 0) {
    return;
  }
  req.rawBody = Buffer.from(buf);
}

/**
 * Defensive completion: `verify` assigns `req.rawBody`; reconcile with parsed `req.body` and UTF‑8‑validate BEFORE JSON.parse downstream.
 *
 * WHY both `verify` and this step:
 * - `verify`: authoritative snapshot for HMAC (`req.rawBody` never undefined when body non‑empty).
 * - This handler: detects parser/body divergence (tamper / double‑parse bugs) early.
 */
export function attachSafepayWebhookRawBody(req, _res, next) {
  const parsed = Buffer.isBuffer(req.body) ? req.body : null;
  let canonical = Buffer.isBuffer(req.rawBody) && req.rawBody.length ? req.rawBody : null;

  if (!canonical && parsed?.length) {
    canonical = Buffer.from(parsed);
  }

  if (!canonical || canonical.length === 0) {
    return next(
      new ApiError(400, 'Webhook body required', {
        branch: 'empty_body',
      })
    );
  }

  if (parsed && parsed.length !== canonical.length) {
    return next(
      new ApiError(400, 'Webhook raw body framing error', {
        branch: 'body_length_mismatch',
      })
    );
  }

  if (parsed && parsed.length === canonical.length && !parsed.equals(canonical)) {
    return next(
      new ApiError(400, 'Webhook body integrity mismatch — aborting verification', {
        branch: 'raw_body_fork',
      })
    );
  }

  req.rawBody = canonical;

  try {
    UTF8_FATAL.decode(req.rawBody);
  } catch {
    return next(
      new ApiError(400, 'Webhook body must be valid UTF‑8 JSON', {
        branch: 'invalid_utf8',
      })
    );
  }

  return next();
}

/**
 * Raw JSON octets only — size‑capped route‑level parser (`verify` binds `req.rawBody`).
 */
export function safepayWebhookExpressRaw() {
  const limit = Math.max(1024, Number(env.safepay.webhookMaxPayloadBytes || 524288));
  return express.raw({
    type: safepayWebhookMimeMatcher,
    limit,
    verify: safepayWebhookRawVerify,
  });
}

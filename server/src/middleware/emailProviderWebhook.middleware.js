/**
 * Email provider webhook ingress — raw body capture for HMAC (mounted before express.json).
 */
import express from 'express';
import { TextDecoder } from 'node:util';
import { ApiError } from '../utils/apiError.js';
import { getEmailWebhookRuntimeConfig } from '../security/emailWebhookConfig.js';

const JSON_MIME = 'application/json';
const UTF8_FATAL = new TextDecoder('utf-8', { fatal: true });

export function isEmailWebhookJsonContentType(headerValue) {
  if (!headerValue) return false;
  const base = String(headerValue).split(';')[0].trim().toLowerCase();
  return base === JSON_MIME;
}

export function requireEmailWebhookJsonContentType(req, _res, next) {
  const ct = req.get('content-type');
  if (!ct || !isEmailWebhookJsonContentType(ct)) {
    return next(
      new ApiError(415, `Content-Type must be ${JSON_MIME}`, { code: 'EMAIL_WEBHOOK_UNSUPPORTED_MEDIA' })
    );
  }
  return next();
}

function emailWebhookMimeMatcher(req) {
  return isEmailWebhookJsonContentType(req.get('content-type'));
}

/** @type {NonNullable<Parameters<typeof express.raw>[0]>['verify']} */
export function emailWebhookRawVerify(req, _res, buf) {
  if (!Buffer.isBuffer(buf)) return;
  const { maxPayloadBytes } = getEmailWebhookRuntimeConfig();
  if (buf.length > maxPayloadBytes) {
    const err = new Error('Payload too large');
    err.status = 413;
    err.type = 'entity.too.large';
    throw err;
  }
  if (buf.length > 0) {
    req.rawBody = Buffer.from(buf);
  }
}

export function attachEmailWebhookRawBody(req, _res, next) {
  const parsed = Buffer.isBuffer(req.body) ? req.body : null;
  let canonical = Buffer.isBuffer(req.rawBody) && req.rawBody.length ? req.rawBody : null;

  if (!canonical && parsed?.length) {
    canonical = Buffer.from(parsed);
  }

  if (!canonical || canonical.length === 0) {
    return next(new ApiError(400, 'Webhook body required', { code: 'EMAIL_WEBHOOK_EMPTY_BODY' }));
  }

  req.rawBody = canonical;

  try {
    UTF8_FATAL.decode(req.rawBody);
  } catch {
    return next(new ApiError(400, 'Webhook body must be valid UTF-8 JSON', { code: 'EMAIL_WEBHOOK_INVALID_UTF8' }));
  }

  try {
    req.body = JSON.parse(req.rawBody.toString('utf8'));
  } catch {
    return next(new ApiError(400, 'Webhook body must be valid JSON', { code: 'EMAIL_WEBHOOK_INVALID_JSON' }));
  }

  return next();
}

export function emailWebhookExpressRaw() {
  const { maxPayloadBytes } = getEmailWebhookRuntimeConfig();
  const limit = Math.max(1024, maxPayloadBytes);
  return express.raw({
    type: emailWebhookMimeMatcher,
    limit,
    verify: emailWebhookRawVerify,
  });
}

/**
 * Fail closed when webhook is disabled or misconfigured — never throws on missing env.queue.
 */
export function requireEmailWebhookOperational(req, _res, next) {
  const config = getEmailWebhookRuntimeConfig();
  if (!config.operational) {
    return next(
      new ApiError(503, 'Email provider webhook is not configured', {
        code: 'EMAIL_WEBHOOK_NOT_CONFIGURED',
        reason: config.disabledReason,
      })
    );
  }
  return next();
}

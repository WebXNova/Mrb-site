/**
 * Email provider webhook configuration — validated at startup, safe runtime accessors.
 *
 * SEC-002: Never access env.queue.* directly in request handlers; use getEmailWebhookRuntimeConfig().
 */
import { env } from '../config/env.js';
import { validateHmacSecretValue } from './teacherThreadSecret.js';

function parseBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

function parseNumEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function stripCred(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/** @type {import('./emailWebhookConfig.types.js').EmailWebhookRuntimeConfig | null} */
let cachedRuntimeConfig = null;

/**
 * Live env slice — reads process.env so tests and emergency overrides work without re-importing env.js.
 * @returns {import('./emailWebhookConfig.types.js').EmailWebhookEnvConfig}
 */
export function getEmailWebhookEnvConfig() {
  const q = env.queue;
  const nodeEnv = process.env.NODE_ENV || env.nodeEnv || 'development';
  return {
    enabled: parseBoolEnv('EMAIL_WEBHOOK_ENABLED', nodeEnv === 'production'),
    emailQueueName: String(process.env.EMAIL_QUEUE_NAME || q.emailQueueName || 'mrb-email').trim() || 'mrb-email',
    sharedSecret: stripCred(process.env.EMAIL_WEBHOOK_SECRET || q.emailWebhookSecret || ''),
    signatureSecret: stripCred(process.env.EMAIL_WEBHOOK_SIGNATURE_SECRET || q.emailWebhookSignatureSecret || ''),
    toleranceSeconds: Math.max(30, parseNumEnv('EMAIL_WEBHOOK_TOLERANCE_SECONDS', q.emailWebhookToleranceSeconds || 300)),
    maxPayloadBytes: Math.max(1024, parseNumEnv('EMAIL_WEBHOOK_MAX_BYTES', q.emailWebhookMaxPayloadBytes || 65536)),
    replayTtlSeconds: Math.max(60, parseNumEnv('EMAIL_WEBHOOK_REPLAY_TTL_SECONDS', q.emailWebhookReplayTtlSeconds || 600)),
    requireRedisReplay: parseBoolEnv(
      'EMAIL_WEBHOOK_REQUIRE_REDIS_REPLAY',
      q.emailWebhookRequireRedisReplay ?? nodeEnv === 'production'
    ),
  };
}
/**
 * Boot-time validation — call from server.js before accepting traffic.
 * Production + enabled: both secrets mandatory with entropy checks.
 * Disabled: skips secret requirement.
 *
 * @returns {import('./emailWebhookConfig.types.js').EmailWebhookRuntimeConfig}
 */
export function validateEmailWebhookConfigAtStartup() {
  const raw = getEmailWebhookEnvConfig();

  if (!raw.enabled) {
    cachedRuntimeConfig = Object.freeze({
      ...raw,
      operational: false,
      disabledReason: 'EMAIL_WEBHOOK_ENABLED=false',
    });
    console.log('[email-webhook] Disabled by configuration (EMAIL_WEBHOOK_ENABLED=false)');
    return cachedRuntimeConfig;
  }

  const isProduction = env.nodeEnv === 'production';

  if (!raw.sharedSecret || !raw.signatureSecret) {
    if (isProduction) {
      throw new Error(
        'EMAIL_WEBHOOK_ENABLED is true but EMAIL_WEBHOOK_SECRET and/or EMAIL_WEBHOOK_SIGNATURE_SECRET are missing. ' +
          'Set both secrets or disable with EMAIL_WEBHOOK_ENABLED=false.'
      );
    }
    cachedRuntimeConfig = Object.freeze({
      ...raw,
      operational: false,
      disabledReason: 'missing_secrets_dev',
    });
    console.warn(
      '[email-webhook] Enabled but secrets missing — endpoint will return 503 until configured (development only).'
    );
    return cachedRuntimeConfig;
  }

  const sharedSecret = validateHmacSecretValue('EMAIL_WEBHOOK_SECRET', raw.sharedSecret);
  const signatureSecret = validateHmacSecretValue('EMAIL_WEBHOOK_SIGNATURE_SECRET', raw.signatureSecret);

  if (sharedSecret === signatureSecret) {
    throw new Error('EMAIL_WEBHOOK_SECRET and EMAIL_WEBHOOK_SIGNATURE_SECRET must differ');
  }

  cachedRuntimeConfig = Object.freeze({
    ...raw,
    sharedSecret,
    signatureSecret,
    operational: true,
    disabledReason: null,
  });

  console.log('[email-webhook] Configuration validated', {
    toleranceSeconds: cachedRuntimeConfig.toleranceSeconds,
    maxPayloadBytes: cachedRuntimeConfig.maxPayloadBytes,
    requireRedisReplay: cachedRuntimeConfig.requireRedisReplay,
  });

  return cachedRuntimeConfig;
}

/**
 * Safe runtime accessor — never throws, never returns undefined nested fields.
 * @returns {import('./emailWebhookConfig.types.js').EmailWebhookRuntimeConfig}
 */
export function getEmailWebhookRuntimeConfig() {
  if (!cachedRuntimeConfig) {
    return validateEmailWebhookConfigAtStartup();
  }
  return cachedRuntimeConfig;
}

/** Test-only reset. */
export function resetEmailWebhookConfigForTests() {
  cachedRuntimeConfig = null;
}

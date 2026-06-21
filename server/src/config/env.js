import 'dotenv/config';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseJwtDurationMs, DEFAULT_REFRESH_MS } from '../utils/jwtDuration.js';
import { parseMysqlPoolConfigFromEnv } from './mysqlPoolConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local development only.
 * Railway ignores .env anyway, so this never affects production.
 */
dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

/**
 * Safe env reader (NO CRASH ON IMPORT)
 */
function required(name, fallback = null) {
  const value = process.env[name];

  if (value === undefined || value === null || value === '') {
    return fallback; // DO NOT throw during import
  }

  return value;
}

/**
 * JWT secret loader — strength checks when present; missing values are allowed at import
 * and enforced by validateProductionStartupConfig() in production.
 */
function loadJwtSecret(name) {
  const value = required(name, '');

  if (!value) {
    return '';
  }

  const lowered = String(value).toLowerCase();

  if (String(value).length < 32) {
    throw new Error(`${name} must be at least 32 characters`);
  }

  if (
    lowered.includes('replace') ||
    lowered.includes('secret') ||
    lowered.includes('changeme') ||
    lowered.includes('example')
  ) {
    throw new Error(`${name} appears weak or placeholder-like. Use a strong random secret.`);
  }

  return value;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function parseSameSite(value, fallback = 'lax') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'strict' || normalized === 'lax' || normalized === 'none') return normalized;
  return fallback;
}

function parseTrustProxy(value) {
  if (value === undefined || value === null || value === '') return false;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  const asNumber = Number(normalized);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;

  return value;
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Positive integer env var: missing/empty → fallback; present but invalid → throw at import.
 */
function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }

  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${name} must be a positive integer (received "${raw}")`);
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer (received "${raw}")`);
  }

  return parsed;
}

function parseEmailProvider(value) {
  const normalized = String(value || 'smtp').trim().toLowerCase();

  if (normalized !== 'smtp' && normalized !== 'sendgrid') {
    throw new Error(
      `EMAIL_PROVIDER must be either "smtp" or "sendgrid" (received "${normalized}")`
    );
  }

  return normalized;
}

/**
 * Remove accidental formatting issues from secrets
 */
function stripCred(value) {
  if (value === undefined || value === null) return '';

  return String(value)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
}

/** Outgoing From header / SendGrid identifier (strip BOM, quotes, CR from Windows .env, etc.). */
function normalizeMailFromIdentity(value) {
  return stripCred(String(value || '').replace(/\r/g, '').replace(/\n/g, ''));
}

const nodeEnv = process.env.NODE_ENV || 'development';
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

function buildTrustedOrigins() {
  const origins = new Set([clientUrl]);

  const extra = String(process.env.TRUSTED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const o of extra) origins.add(o);

  if (nodeEnv !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:5174');
    origins.add('http://127.0.0.1:5173');
    origins.add('http://127.0.0.1:5174');
  }

  return [...origins];
}

/**
 * Safepay config (UNCHANGED LOGIC)
 */
const SAFEPAY_RESOLVED_API_HOST = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  production: 'https://api.getsafepay.com',
};

const safepayEnvRaw = stripCred(process.env.SAFEPAY_ENV || '');
const safepayEnvLower = safepayEnvRaw.toLowerCase();

let safepayEnvTier;

if (!safepayEnvRaw || safepayEnvLower === 'sandbox') {
  safepayEnvTier = 'sandbox';
} else if (safepayEnvLower === 'production' || safepayEnvLower === 'prod') {
  safepayEnvTier = 'production';
} else {
  throw new Error(
    `[safepay] SAFEPAY_ENV must be "sandbox" or "production" (got "${safepayEnvRaw}")`
  );
}

const safepayMerchantSecret = stripCred(
  process.env.SAFEPAY_MERCHANT_SECRET ||
  process.env.SAFEPAY_SECRET_KEY ||
  process.env.SAFEPAY_API_KEY ||
  ''
);

const safepayMerchantPublishableKey =
  stripCred(process.env.SAFEPAY_MERCHANT_API_KEY || process.env.SAFEPAY_PUBLIC_KEY || '') || '';

const safepayWebhookSecretHex = stripCred(process.env.SAFEPAY_WEBHOOK_SECRET || '')
  .replace(/^0x/i, '')
  .trim();

const safepayWebhookSecretFinal =
  safepayWebhookSecretHex || safepayMerchantSecret;

const safepayMisconfiguredHalves =
  Boolean(safepayMerchantSecret) !== Boolean(safepayMerchantPublishableKey);

if (safepayMisconfiguredHalves && (safepayMerchantSecret || safepayMerchantPublishableKey)) {
  throw new Error(
    '[safepay] Both secret and publishable key are required'
  );
}

if (
  safepayMerchantSecret &&
  safepayMerchantPublishableKey &&
  safepayMerchantSecret === safepayMerchantPublishableKey
) {
  throw new Error('[safepay] Secret and publishable key must differ');
}

/** Lowercase hostname labels after '@' (comma-separated BLOCKED_EMAIL_DOMAINS); empty unless configured. */
const blockedEmailDomains = parseCsv(process.env.BLOCKED_EMAIL_DOMAINS)
  .map((d) => String(d || '').trim().toLowerCase())
  .filter(Boolean);

/**
 * EXPORT ENV
 */
export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  clientUrl,

  mysql: {
    host: required('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: required('MYSQL_USER', ''),
    password: required('MYSQL_PASSWORD', ''),
    database: required('MYSQL_DATABASE', ''),
    pool: parseMysqlPoolConfigFromEnv(),
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },

  queue: {
    emailQueueName: String(process.env.EMAIL_QUEUE_NAME || 'mrb-email').trim() || 'mrb-email',
    /** When true, /api/email/provider-feedback is armed (secrets required in production). */
    emailWebhookEnabled: parseBoolean(process.env.EMAIL_WEBHOOK_ENABLED, nodeEnv === 'production'),
    emailWebhookSecret: stripCred(process.env.EMAIL_WEBHOOK_SECRET || ''),
    emailWebhookSignatureSecret: stripCred(process.env.EMAIL_WEBHOOK_SIGNATURE_SECRET || ''),
    emailWebhookToleranceSeconds: parseNumber(process.env.EMAIL_WEBHOOK_TOLERANCE_SECONDS, 300),
    emailWebhookMaxPayloadBytes: parseNumber(process.env.EMAIL_WEBHOOK_MAX_BYTES, 65536),
    emailWebhookReplayTtlSeconds: parseNumber(process.env.EMAIL_WEBHOOK_REPLAY_TTL_SECONDS, 600),
    /** Production default: reject webhooks when Redis replay dedupe is unavailable. */
    emailWebhookRequireRedisReplay: parseBoolean(
      process.env.EMAIL_WEBHOOK_REQUIRE_REDIS_REPLAY,
      nodeEnv === 'production'
    ),
  },

  jwt: {
    accessSecret: loadJwtSecret('JWT_ACCESS_SECRET'),
    refreshSecret: loadJwtSecret('JWT_REFRESH_SECRET'),
    previousAccessSecrets: parseCsv(process.env.JWT_ACCESS_PREVIOUS_SECRETS),
    previousRefreshSecrets: parseCsv(process.env.JWT_REFRESH_PREVIOUS_SECRETS),
    issuer: process.env.JWT_ISSUER || 'mrb-learning',
    audience: process.env.JWT_AUDIENCE || 'mrb-learning-clients',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
  },

  security: {
    requireRedisInProduction: parseBoolean(process.env.REQUIRE_REDIS_IN_PRODUCTION, true),
    allowLegacyTokenVersion: parseBoolean(process.env.ALLOW_LEGACY_TOKEN_VERSION, false),
    trustedOrigins: buildTrustedOrigins(),
    refreshCookieSameSite: parseSameSite(process.env.REFRESH_COOKIE_SAMESITE, 'lax'),
    refreshCookieSecure: parseBoolean(process.env.REFRESH_COOKIE_SECURE, nodeEnv === 'production'),
    refreshCookiePath: process.env.REFRESH_COOKIE_PATH || '/api/auth',
    /** Aligns refresh + CSRF cookie Max-Age with JWT_REFRESH_EXPIRES_IN. */
    refreshCookieMaxAgeMs: parseJwtDurationMs(process.env.JWT_REFRESH_EXPIRES_IN || '90d', DEFAULT_REFRESH_MS),
    /** Grace window for legitimate multi-tab refresh races (ms). */
    refreshReplayGraceMs: Number(process.env.AUTH_REFRESH_REPLAY_GRACE_MS || 60_000),
    csrfCookiePath: process.env.CSRF_COOKIE_PATH || '/',
    accessCookieSameSite: parseSameSite(process.env.ACCESS_COOKIE_SAMESITE, 'lax'),
    accessCookieSecure: parseBoolean(process.env.ACCESS_COOKIE_SECURE, nodeEnv === 'production'),
    accessCookiePath: process.env.ACCESS_COOKIE_PATH || '/api',
    accessCookieMaxAgeMs: Number(process.env.ACCESS_COOKIE_MAX_AGE_MS || 15 * 60 * 1000),
    /**
     * Attempt JWT transport: cookie (production default) | dual | bearer
     * cookie = HttpOnly only, no token in JSON, Bearer rejected
     */
    attemptTokenMode: process.env.ATTEMPT_TOKEN_MODE || (nodeEnv === 'production' ? 'cookie' : 'dual'),
    attemptCookieSameSite: parseSameSite(process.env.ATTEMPT_COOKIE_SAMESITE, 'strict'),
    attemptCookieSecure: parseBoolean(process.env.ATTEMPT_COOKIE_SECURE, nodeEnv === 'production'),
    attemptCookiePath: process.env.ATTEMPT_COOKIE_PATH || '/api/tests',
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    authChallengeKey: process.env.AUTH_CHALLENGE_KEY || '',
  },

  email: {
    provider: parseEmailProvider(process.env.EMAIL_PROVIDER),
    from: normalizeMailFromIdentity(
      process.env.EMAIL_FROM || process.env.SMTP_FROM || ''
    ),
    sendgridApiKey: stripCred(process.env.SENDGRID_API_KEY || ''),
    sendgridSandboxMode: parseBoolean(process.env.EMAIL_SANDBOX_MODE, false),
    host: process.env.SMTP_HOST || '',
    port: parseNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    secure: parseBoolean(process.env.SMTP_SECURE, false),
  },

  safepay: {
    apiKey: safepayMerchantSecret,
    publicKey: safepayMerchantPublishableKey,
    env: safepayEnvTier,
    apiHost: SAFEPAY_RESOLVED_API_HOST[safepayEnvTier],
    webhookSecretHex: safepayWebhookSecretHex,
    webhookSecretIsDedicated: Boolean(safepayWebhookSecretHex),
    webhookTimestampSkewSeconds: parseNumber(
      process.env.SAFEPAY_WEBHOOK_TIMESTAMP_SKEW_SECONDS,
      300
    ),
    webhookMaxPayloadBytes: parseNumber(
      process.env.SAFEPAY_WEBHOOK_MAX_BYTES,
      524288
    ),
    webhookReplayTtlSeconds: parseNumber(
      process.env.SAFEPAY_WEBHOOK_REPLAY_TTL_SECONDS,
      86400
    ),
  },

  abuse: {
    /** When true, signup + resend paths return 503 if Redis failed (prevents naive in-memory drift). */
    requireRedisForCriticalAuthWrites: parseBoolean(
      process.env.REQUIRE_REDIS_FOR_CRITICAL_AUTH_WRITES,
      true
    ),
    /** Cloudflare Turnstile secret (siteverify); optional until abuse threshold triggers challenges. */
    captchaSecret: stripCred(process.env.TURNSTILE_SECRET_KEY || process.env.ABUSE_CAPTCHA_SECRET || ''),
    blockedEmailDomains,
  },

  /** Student test runtime — G-RT-02 legacy deprecation (default: disabled / 410). */
  runtime: {
    allowLegacyStudentEndpoints: parseBoolean(process.env.LEGACY_RUNTIME_ALLOW, false),
  },

  /** Q&A image upload limits (student-qa + teacher-qa). */
  qaUpload: {
    maxBytes: parseNumber(process.env.QA_IMAGE_UPLOAD_MAX_BYTES, 5 * 1024 * 1024),
    maxWidth: parseNumber(process.env.QA_IMAGE_UPLOAD_MAX_WIDTH, 8000),
    maxHeight: parseNumber(process.env.QA_IMAGE_UPLOAD_MAX_HEIGHT, 8000),
    maxPixels: parseNumber(process.env.QA_IMAGE_UPLOAD_MAX_PIXELS, 64_000_000),
  },

  /** Q&A voice recording upload limits (student-qa + teacher-qa). */
  qaAudioUpload: {
    maxBytes: parseNumber(process.env.QA_AUDIO_UPLOAD_MAX_BYTES, 10 * 1024 * 1024),
    maxDurationSec: parseNumber(process.env.QA_AUDIO_UPLOAD_MAX_DURATION_SEC, 120),
    minDurationSec: parseNumber(process.env.QA_AUDIO_UPLOAD_MIN_DURATION_SEC, 1),
  },

  /** Q&A audit logging — retry, dead-letter, and alerting. */
  qaAuditLog: {
    maxRetries: parseNumber(process.env.QA_AUDIT_LOG_MAX_RETRIES, 3),
    retryDelayMs: parseNumber(process.env.QA_AUDIT_LOG_RETRY_DELAY_MS, 100),
    dlqEnabled: parseBoolean(process.env.QA_AUDIT_LOG_DLQ_ENABLED, true),
    dlqDir: String(process.env.QA_AUDIT_LOG_DLQ_DIR || 'data/qa-audit-dlq').trim(),
    stdoutEnabled: parseBoolean(process.env.QA_AUDIT_LOG_STDOUT_ENABLED, false),
    alertThreshold: parseNumber(process.env.QA_AUDIT_LOG_ALERT_THRESHOLD, 5),
    alertWindowMs: parseNumber(process.env.QA_AUDIT_LOG_ALERT_WINDOW_MS, 60_000),
  },

  /** Teacher Q&A answer upload rate limits (image + audio). */
  teacherUploadRateLimit: {
    requireRedis: parseBoolean(process.env.TEACHER_UPLOAD_REQUIRE_REDIS, nodeEnv === 'production'),
    image: {
      burstSessionPerMinute: parseNumber(process.env.TEACHER_UPLOAD_IMAGE_BURST_SESSION_PER_MIN, 5),
      burstIpPerMinute: parseNumber(process.env.TEACHER_UPLOAD_IMAGE_BURST_IP_PER_MIN, 8),
      teacherPerHour: parseNumber(process.env.TEACHER_UPLOAD_IMAGE_TEACHER_PER_HOUR, 30),
      teacherPerDay: parseNumber(process.env.TEACHER_UPLOAD_IMAGE_TEACHER_PER_DAY, 100),
      ipPerHour: parseNumber(process.env.TEACHER_UPLOAD_IMAGE_IP_PER_HOUR, 45),
      ipPerDay: parseNumber(process.env.TEACHER_UPLOAD_IMAGE_IP_PER_DAY, 120),
    },
    audio: {
      burstSessionPerMinute: parseNumber(process.env.TEACHER_UPLOAD_AUDIO_BURST_SESSION_PER_MIN, 3),
      burstIpPerMinute: parseNumber(process.env.TEACHER_UPLOAD_AUDIO_BURST_IP_PER_MIN, 5),
      teacherPerHour: parseNumber(process.env.TEACHER_UPLOAD_AUDIO_TEACHER_PER_HOUR, 18),
      teacherPerDay: parseNumber(process.env.TEACHER_UPLOAD_AUDIO_TEACHER_PER_DAY, 50),
      ipPerHour: parseNumber(process.env.TEACHER_UPLOAD_AUDIO_IP_PER_HOUR, 25),
      ipPerDay: parseNumber(process.env.TEACHER_UPLOAD_AUDIO_IP_PER_DAY, 70),
    },
  },

  /** Q&A orphan upload cleanup (student-qa + teacher-qa). */
  qaUploadCleanup: {
    orphanTtlHours: parseNumber(process.env.QA_UPLOAD_CLEANUP_ORPHAN_TTL_HOURS, 24),
    tempTtlHours: parseNumber(process.env.QA_UPLOAD_CLEANUP_TEMP_TTL_HOURS, 1),
    quarantineRetentionDays: parseNumber(process.env.QA_UPLOAD_CLEANUP_QUARANTINE_RETENTION_DAYS, 30),
    batchSize: parseNumber(process.env.QA_UPLOAD_CLEANUP_BATCH_SIZE, 100),
    scheduleEnabled: parseBoolean(process.env.QA_UPLOAD_CLEANUP_SCHEDULE_ENABLED, false),
    intervalMinutes: parseNumber(process.env.QA_UPLOAD_CLEANUP_INTERVAL_MINUTES, 360),
    mode: String(process.env.QA_UPLOAD_CLEANUP_MODE || 'quarantine').trim().toLowerCase(),
  },

  /** activity_logs retention — purge rows older than retention window. */
  activityLogRetention: {
    retentionDays: parseNumber(process.env.ACTIVITY_LOG_RETENTION_DAYS, 90),
    batchSize: parseNumber(process.env.ACTIVITY_LOG_RETENTION_BATCH_SIZE, 500),
    batchPauseMs: parseNumber(process.env.ACTIVITY_LOG_RETENTION_BATCH_PAUSE_MS, 50),
    maxBatchesPerRun: parseNumber(process.env.ACTIVITY_LOG_RETENTION_MAX_BATCHES_PER_RUN, 200),
    scheduleEnabled: parseBoolean(
      process.env.ACTIVITY_LOG_RETENTION_SCHEDULE_ENABLED,
      nodeEnv === 'production'
    ),
    intervalMinutes: parseNumber(process.env.ACTIVITY_LOG_RETENTION_INTERVAL_MINUTES, 1440),
  },

  /** idempotency_keys cleanup — purge expired replay protection rows. */
  idempotencyCleanup: {
    batchSize: parseNumber(process.env.IDEMPOTENCY_CLEANUP_BATCH_SIZE, 500),
    batchPauseMs: parseNumber(process.env.IDEMPOTENCY_CLEANUP_BATCH_PAUSE_MS, 50),
    maxBatchesPerRun: parseNumber(process.env.IDEMPOTENCY_CLEANUP_MAX_BATCHES_PER_RUN, 200),
    scheduleEnabled: parseBoolean(
      process.env.IDEMPOTENCY_CLEANUP_SCHEDULE_ENABLED,
      nodeEnv === 'production'
    ),
    intervalMinutes: parseNumber(process.env.IDEMPOTENCY_CLEANUP_INTERVAL_MINUTES, 360),
  },

  /** processed_webhooks retention — purge replay ledger rows older than retention window. */
  processedWebhooksRetention: {
    retentionDays: parseNumber(process.env.PROCESSED_WEBHOOKS_RETENTION_DAYS, 90),
    batchSize: parseNumber(process.env.PROCESSED_WEBHOOKS_RETENTION_BATCH_SIZE, 500),
    batchPauseMs: parseNumber(process.env.PROCESSED_WEBHOOKS_RETENTION_BATCH_PAUSE_MS, 50),
    maxBatchesPerRun: parseNumber(process.env.PROCESSED_WEBHOOKS_RETENTION_MAX_BATCHES_PER_RUN, 200),
    scheduleEnabled: parseBoolean(
      process.env.PROCESSED_WEBHOOKS_RETENTION_SCHEDULE_ENABLED,
      nodeEnv === 'production'
    ),
    intervalMinutes: parseNumber(process.env.PROCESSED_WEBHOOKS_RETENTION_INTERVAL_MINUTES, 1440),
  },

  /** Teacher Q&A opaque thread identifiers (HMAC). Validated at server startup. */
  teacherThread: {
    previousSecrets: parseCsv(process.env.TEACHER_THREAD_PREVIOUS_SECRETS),
  },

  verification: {
    challengeThresholdPerIpPerHour: parseNumber(
      process.env.VERIFICATION_CHALLENGE_THRESHOLD_PER_IP_PER_HOUR,
      48
    ),
    resendMaxPerHour: parseNumber(process.env.VERIFICATION_RESEND_MAX_PER_HOUR, 12),
    resendCooldownSeconds: parseNumber(process.env.VERIFICATION_RESEND_COOLDOWN_SECONDS, 90),
    tokenTtlMinutes: parseNumber(process.env.VERIFICATION_TOKEN_TTL_MINUTES, 15),
    authPerSubnetPerMinute: parseNumber(process.env.VERIFICATION_AUTH_PER_SUBNET_PER_MINUTE, 120),
    signupPerIpPer15Min: parseNumber(process.env.VERIFICATION_SIGNUP_PER_IP_PER_15MIN, 8),
    signupPerSubnetPer15Min: parseNumber(process.env.VERIFICATION_SIGNUP_PER_SUBNET_PER_15MIN, 35),
    signupPerAsnPer15Min: parseNumber(process.env.VERIFICATION_SIGNUP_PER_ASN_PER_15MIN, 80),
    signupPerEmailPerDay: parseNumber(process.env.VERIFICATION_SIGNUP_PER_EMAIL_PER_DAY, 10),
    verifyPerIpPerMinute: parseNumber(process.env.VERIFICATION_VERIFY_PER_IP_PER_MINUTE, 40),
    verifyPerSubnetPerMinute: parseNumber(process.env.VERIFICATION_VERIFY_PER_SUBNET_PER_MINUTE, 80),
    verifyPerAsnPerMinute: parseNumber(process.env.VERIFICATION_VERIFY_PER_ASN_PER_MINUTE, 160),
    resendCoarsePerIpPerMinute: parseNumber(process.env.VERIFICATION_RESEND_COARSE_IP_PER_MINUTE, 15),
    resendCoarsePerSubnetPerMinute: parseNumber(
      process.env.VERIFICATION_RESEND_COARSE_SUBNET_PER_MINUTE,
      40
    ),
    resendCoarsePerAsnPerMinute: parseNumber(process.env.VERIFICATION_RESEND_COARSE_ASN_PER_MINUTE, 80),
    providerWebhookPerIpPerMinute: parseNumber(
      process.env.VERIFICATION_PROVIDER_WEBHOOK_IP_PER_MINUTE,
      200
    ),
    safepayWebhookPerIpPerMinute: parseNumber(
      process.env.SAFEPAY_WEBHOOK_PER_IP_PER_MINUTE,
      240
    ),
  },

  passwordReset: {
    tokenTtlMinutes: parsePositiveIntEnv('PASSWORD_RESET_TOKEN_TTL_MINUTES', 45),
    retentionHours: parsePositiveIntEnv('PASSWORD_RESET_RETENTION_HOURS', 72),
    maxPerEmailPerHour: parsePositiveIntEnv('PASSWORD_RESET_MAX_PER_EMAIL_PER_HOUR', 3),
    cooldownSeconds: parsePositiveIntEnv('PASSWORD_RESET_COOLDOWN_SECONDS', 90),
  },

  /** Google Identity Services / OAuth (student sign-in). */
  google: {
    clientId: stripCred(process.env.GOOGLE_CLIENT_ID || ''),
  },

  /** Course catalog media — signed public URLs or token-based enrolled access. */
  media: {
    /** When true (default), public catalog API emits signed thumbnail URLs. When false, public catalog hides thumbnails. */
    publicCatalogMedia: parseBoolean(process.env.PUBLIC_CATALOG_MEDIA, true),
    catalogSignedUrlTtlSeconds: parseNumber(process.env.CATALOG_MEDIA_SIGNED_URL_TTL_SECONDS, 86400),
    signingSecret: stripCred(process.env.MEDIA_SIGNING_SECRET || ''),
  },

  /**
   * Admin secret path — loaded and validated in adminSecretPath.config.js (fail-closed at startup).
   * Intentionally not duplicated here to avoid accidental logging; import getAdminApiMountPath() instead.
   */
  adminSecretPath: {
    envKey: 'ADMIN_SECRET_PATH',
    previousEnvKey: 'ADMIN_SECRET_PATH_PREVIOUS',
    minSegmentLength: 16,
  },
};


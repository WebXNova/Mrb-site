import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  override: true,
});

function required(name, fallback = null) {
  const value = process.env[name] ?? fallback;
  if (value === null || value === undefined || value === '') {
    throw new Error(`Missing required env variable: ${name}`);
  }
  return value;
}

function requiredJwtSecret(name) {
  const value = required(name);
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

function parseEmailProvider(value) {
  const normalized = String(value || 'smtp').trim().toLowerCase();
  if (normalized !== 'smtp' && normalized !== 'sendgrid') {
    throw new Error(`EMAIL_PROVIDER must be either "smtp" or "sendgrid" (received "${normalized}")`);
  }
  return normalized;
}

/** Strip BOM / accidental quotes / null-ish — avoids “client not found” from credential paste drift. */
function stripCred(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^["']|["']$/g, '');
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
  }
  return [...origins];
}

const SAFEPAY_RESOLVED_API_HOST = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  production: 'https://api.getsafepay.com',
};

const safepayEnvRaw = stripCred(process.env.SAFEPAY_ENV || '');
const safepayEnvLower = safepayEnvRaw.toLowerCase();
/** @type {'sandbox' | 'production'} */
let safepayEnvTier;
if (!safepayEnvRaw || safepayEnvLower === 'sandbox') {
  safepayEnvTier = 'sandbox';
} else if (safepayEnvLower === 'production' || safepayEnvLower === 'prod') {
  safepayEnvTier = 'production';
} else {
  throw new Error(
    `[safepay] SAFEPAY_ENV must be "sandbox" or "production" (got "${safepayEnvRaw}"). This must match paired keys so API host aligns with sandbox vs live.`
  );
}

/**
 * Prefer explicit names; SAFEPAY_API_KEY is LEGACY ONLY for merchant SECRET — not publishable API key:
 * Header `x-sfpy-merchant-secret`: MERCHANT_SECRET → SECRET_KEY → API_KEY legacy
 * Publishable merchant key for JSON (`merchant_api_key`): SAFEPAY_MERCHANT_API_KEY → SAFEPAY_PUBLIC_KEY
 */
const safepayMerchantSecret = stripCred(
  process.env.SAFEPAY_MERCHANT_SECRET ||
    process.env.SAFEPAY_SECRET_KEY ||
    process.env.SAFEPAY_API_KEY ||
    ''
);

const safepayMerchantPublishableKey =
  stripCred(process.env.SAFEPAY_MERCHANT_API_KEY || process.env.SAFEPAY_PUBLIC_KEY || '') || '';

/** Webhook signing secret: exactly 64 hex chars (32 bytes). Decoded with Buffer.from(secret, 'hex') for HMAC-SHA512 — not base64. */
const safepayWebhookSecretHex = stripCred(process.env.SAFEPAY_WEBHOOK_SECRET || '')
  .replace(/^0x/i, '')
  .trim();
const safepayWebhookSecretFinal = safepayWebhookSecretHex || safepayMerchantSecret;

const safepayMisconfiguredHalves =
  Boolean(safepayMerchantSecret) !== Boolean(safepayMerchantPublishableKey);
if (safepayMisconfiguredHalves && (safepayMerchantSecret || safepayMerchantPublishableKey)) {
  throw new Error(
    '[safepay] Set BOTH halves: merchant SECRET (SAFEPAY_MERCHANT_SECRET / SAFEPAY_SECRET_KEY / legacy SAFEPAY_API_KEY) AND publishable key (SAFEPAY_MERCHANT_API_KEY / SAFEPAY_PUBLIC_KEY). One without the other → unauthorized / "could not fetch client".'
  );
}

if (
  safepayMerchantSecret &&
  safepayMerchantPublishableKey &&
  safepayMerchantSecret === safepayMerchantPublishableKey
) {
  throw new Error(
    '[safepay] Merchant secret and publishable API key must differ (two fields from Developers → API for the SAME environment). Identical strings cause "could not fetch client".'
  );
}

if (safepayMerchantSecret && safepayMerchantSecret.length < 8) {
  throw new Error(
    '[safepay] Merchant secret is too short; likely wrong variable (use server secret — not publishable API key name).'
  );
}

if (safepayMerchantPublishableKey && safepayMerchantPublishableKey.length < 8) {
  throw new Error('[safepay] Publishable merchant API key looks invalid (too short).');
}

if (safepayWebhookSecretHex && !/^[a-fA-F0-9]{64}$/.test(safepayWebhookSecretHex)) {
  console.warn(
    '[safepay] SAFEPAY_WEBHOOK_SECRET must be exactly 64 hexadecimal characters (32 bytes). Webhook verification will fail until corrected.'
  );
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT || 4000),
  clientUrl,

  mysql: {
    host: required('MYSQL_HOST', '127.0.0.1'),
    port: Number(process.env.MYSQL_PORT || 3306),
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    database: required('MYSQL_DATABASE'),
  },
  redis: {
    url: process.env.REDIS_URL || '',
  },

  jwt: {
    accessSecret: requiredJwtSecret('JWT_ACCESS_SECRET'),
    refreshSecret: requiredJwtSecret('JWT_REFRESH_SECRET'),
    previousAccessSecrets: parseCsv(process.env.JWT_ACCESS_PREVIOUS_SECRETS),
    previousRefreshSecrets: parseCsv(process.env.JWT_REFRESH_PREVIOUS_SECRETS),
    issuer: process.env.JWT_ISSUER || 'mrb-learning',
    audience: process.env.JWT_AUDIENCE || 'mrb-learning-clients',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  security: {
    requireRedisInProduction: parseBoolean(process.env.REQUIRE_REDIS_IN_PRODUCTION, true),
    allowLegacyTokenVersion: parseBoolean(process.env.ALLOW_LEGACY_TOKEN_VERSION, false),
    /** Origins allowed for cookie-auth endpoints (Origin header). Add production frontends via TRUSTED_ORIGINS (comma-separated). */
    trustedOrigins: buildTrustedOrigins(),
    refreshCookieSameSite: parseSameSite(process.env.REFRESH_COOKIE_SAMESITE, 'lax'),
    refreshCookieSecure: parseBoolean(process.env.REFRESH_COOKIE_SECURE, nodeEnv === 'production'),
    refreshCookiePath: process.env.REFRESH_COOKIE_PATH || '/api/auth',
    /** CSRF double-submit cookie: must be readable from `document.cookie` on SPA routes — use `/`, not `/api/auth`. Refresh tokens stay on `refreshCookiePath`. */
    csrfCookiePath: process.env.CSRF_COOKIE_PATH || '/',
    accessCookieSameSite: parseSameSite(process.env.ACCESS_COOKIE_SAMESITE, process.env.REFRESH_COOKIE_SAMESITE || 'lax'),
    accessCookieSecure: parseBoolean(process.env.ACCESS_COOKIE_SECURE, nodeEnv === 'production'),
    accessCookiePath: process.env.ACCESS_COOKIE_PATH || '/api',
    accessCookieMaxAgeMs: Number(process.env.ACCESS_COOKIE_MAX_AGE_MS || 15 * 60 * 1000),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    authChallengeKey: process.env.AUTH_CHALLENGE_KEY || '',
  },
  email: {
    provider: parseEmailProvider(process.env.EMAIL_PROVIDER),
    from: process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    sendgridSandboxMode: parseBoolean(process.env.EMAIL_SANDBOX_MODE, false),
    host: process.env.SMTP_HOST || '',
    port: parseNumber(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    secure: parseBoolean(process.env.SMTP_SECURE, false),
  },
  verification: {
    tokenTtlMinutes: parseNumber(process.env.EMAIL_VERIFY_TTL_MINUTES, 15),
    resendCooldownSeconds: parseNumber(process.env.EMAIL_VERIFY_RESEND_COOLDOWN_SECONDS, 60),
    resendMaxPerHour: parseNumber(process.env.EMAIL_VERIFY_RESEND_MAX_PER_HOUR, 5),
    verifyPerIpPerMinute: parseNumber(process.env.EMAIL_VERIFY_PER_IP_PER_MINUTE, 5),
    verifyPerSubnetPerMinute: parseNumber(process.env.EMAIL_VERIFY_PER_SUBNET_PER_MINUTE, 40),
    authPerSubnetPerMinute: parseNumber(process.env.AUTH_PER_SUBNET_PER_MINUTE, 120),
    resendCoarsePerIpPerMinute: parseNumber(process.env.EMAIL_RESEND_COARSE_PER_IP_PER_MINUTE, 20),
    resendCoarsePerSubnetPerMinute: parseNumber(process.env.EMAIL_RESEND_COARSE_PER_SUBNET_PER_MINUTE, 120),
    resendPerIpPer15Min: parseNumber(process.env.EMAIL_RESEND_PER_IP_PER_15_MIN, 10),
    resendPerEmailPer15Min: parseNumber(process.env.EMAIL_RESEND_PER_EMAIL_PER_15_MIN, 3),
    signupPerIpPer15Min: parseNumber(process.env.SIGNUP_PER_IP_PER_15_MIN, 10),
    signupPerEmailPerDay: parseNumber(process.env.SIGNUP_PER_EMAIL_PER_DAY, 5),
    signupPerSubnetPer15Min: parseNumber(process.env.SIGNUP_PER_SUBNET_PER_15_MIN, 60),
    signupPerAsnPer15Min: parseNumber(process.env.SIGNUP_PER_ASN_PER_15_MIN, 120),
    challengeThresholdPerIpPerHour: parseNumber(process.env.CHALLENGE_THRESHOLD_PER_IP_PER_HOUR, 15),
    verifyPerAsnPerMinute: parseNumber(process.env.EMAIL_VERIFY_PER_ASN_PER_MINUTE, 180),
    resendCoarsePerAsnPerMinute: parseNumber(process.env.EMAIL_RESEND_COARSE_PER_ASN_PER_MINUTE, 300),
    providerWebhookPerIpPerMinute: parseNumber(process.env.EMAIL_PROVIDER_WEBHOOK_PER_IP_PER_MINUTE, 120),
    /** Safepay `/api/payments/webhook` sliding window per client IP (minute). */
    safepayWebhookPerIpPerMinute: parseNumber(process.env.SAFEPAY_WEBHOOK_PER_IP_PER_MINUTE, 240),
  },
  abuse: {
    requireRedisForCriticalAuthWrites: parseBoolean(process.env.REQUIRE_REDIS_FOR_CRITICAL_AUTH_WRITES, nodeEnv === 'production'),
    captchaProvider: process.env.CAPTCHA_PROVIDER || '',
    captchaSecret: process.env.CAPTCHA_SECRET || '',
    blockedEmailDomains: parseCsv(process.env.BLOCKED_EMAIL_DOMAINS),
  },
  queue: {
    emailQueueName: process.env.EMAIL_QUEUE_NAME || 'email-delivery',
    emailWebhookSecret: process.env.EMAIL_WEBHOOK_SECRET || '',
    emailWebhookSignatureSecret: process.env.EMAIL_WEBHOOK_SIGNATURE_SECRET || '',
    emailWebhookToleranceSeconds: parseNumber(process.env.EMAIL_WEBHOOK_TOLERANCE_SECONDS, 300),
  },
  safepay: {
    /** Merchant SECRET (`x-sfpy-merchant-secret`) — `new Safepay(this, { authType: 'secret', host })` */
    apiKey: safepayMerchantSecret,
    /** Publishable merchant key — JSON `merchant_api_key` ONLY (never passed to SDK ctor). */
    publicKey: safepayMerchantPublishableKey,
    env: safepayEnvTier,
    /** Must match SAFEPAY_ENV tier (sandbox host only with sandbox credentials). */
    apiHost: SAFEPAY_RESOLVED_API_HOST[safepayEnvTier],
    /** 64-char hex webhook signing secret, or empty if not configured. */
    webhookSecretHex: safepayWebhookSecretHex,
    /** True when SAFEPAY_WEBHOOK_SECRET is set (hex). */
    webhookSecretIsDedicated: Boolean(safepayWebhookSecretHex),
    /** Reject X-SFPY-TIMESTAMP outside ±N seconds (replay of old signed bodies). */
    webhookTimestampSkewSeconds: parseNumber(process.env.SAFEPAY_WEBHOOK_TIMESTAMP_SKEW_SECONDS, 300),
    /** Max raw JSON body for webhook (express.raw limit + post-parse guard). */
    webhookMaxPayloadBytes: parseNumber(process.env.SAFEPAY_WEBHOOK_MAX_BYTES, 524288),
    /** Redis TTL for replay short-circuit key after successful processing. */
    webhookReplayTtlSeconds: parseNumber(process.env.SAFEPAY_WEBHOOK_REPLAY_TTL_SECONDS, 86400),
  },

};

if (safepayMerchantSecret && safepayMerchantPublishableKey) {
  console.log('[safepay] startup credential probe:', {
    SAFEPAY_ENV: safepayEnvTier,
    apiHost: SAFEPAY_RESOLVED_API_HOST[safepayEnvTier],
    merchantSecretConfigured: true,
    publishableMerchantKeyConfigured: true,
    merchantSecretLen: safepayMerchantSecret.length,
    publishableMerchantKeyLen: safepayMerchantPublishableKey.length,
    webhookSigningSecretHexLen: safepayWebhookSecretHex.length,
    webhookSigningSecretConfigured: Boolean(safepayWebhookSecretHex),
  });
} else if (!safepayMerchantSecret && !safepayMerchantPublishableKey) {
  console.log('[safepay] payments disabled until merchant secret + publishable API key are set.');
}

if (env.email.provider === 'sendgrid' && !env.email.sendgridApiKey) {
  throw new Error('SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid');
}

if (env.email.provider === 'smtp' && (!env.email.host || !env.email.port || !env.email.user || !env.email.pass)) {
  throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS are required when EMAIL_PROVIDER=smtp');
}

if (env.nodeEnv === 'production') {
  if (env.security.refreshCookiePath === env.security.csrfCookiePath) {
    throw new Error(
      'CSRF_COOKIE_PATH must differ from REFRESH_COOKIE_PATH: keep refresh on /api/auth and CSRF on / so the SPA can read only the CSRF cookie.'
    );
  }
  if (env.security.requireRedisInProduction && !env.redis.url) {
    throw new Error('REDIS_URL is required in production when REQUIRE_REDIS_IN_PRODUCTION is enabled');
  }
  if (env.jwt.issuer === 'mrb-learning' || env.jwt.audience === 'mrb-learning-clients') {
    throw new Error('JWT_ISSUER and JWT_AUDIENCE must be explicitly overridden in production');
  }
  if (!env.security.refreshCookieSecure || !env.security.accessCookieSecure) {
    throw new Error('REFRESH_COOKIE_SECURE and ACCESS_COOKIE_SECURE must be true in production');
  }
  if (!env.email.from) {
    throw new Error('EMAIL_FROM is required in production');
  }
  if (env.email.provider === 'sendgrid' && !env.email.sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY is required in production when EMAIL_PROVIDER=sendgrid');
  }
}
